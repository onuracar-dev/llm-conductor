use serde::{Deserialize, Serialize};
use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

#[tauri::command]
fn pick_project_folder() -> Option<String> {
    rfd::FileDialog::new().pick_folder().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_project_files(root: String, max_files: Option<usize>) -> Result<Vec<FileEntry>, String> {
    let limit = max_files.unwrap_or(400);
    let mut entries = Vec::new();
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("Project directory does not exist".to_string());
    }
    scan_dir(&root_path, &root_path, &mut entries, limit)?;
    Ok(entries)
}

fn scan_dir(root: &Path, current: &Path, entries: &mut Vec<FileEntry>, limit: usize) -> Result<(), String> {
    if entries.len() >= limit {
        return Ok(());
    }
    let read = match fs::read_dir(current) {
        Ok(r) => r,
        Err(_) => return Ok(()),
    };

    for item in read.flatten() {
        let path = item.path();
        let file_name = item.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "dist" || file_name == "build" || file_name == ".git" {
            continue;
        }

        let is_dir = path.is_dir();
        let size = item.metadata().map(|m| m.len()).unwrap_or(0);
        let relative_path = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string().replace('\\', "/");

        entries.push(FileEntry {
            name: file_name,
            path: relative_path,
            is_dir,
            size,
        });

        if is_dir {
            scan_dir(root, &path, entries, limit)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn read_file_content(workspace: String, relative_path: String) -> Result<String, String> {
    let full_path = PathBuf::from(&workspace).join(&relative_path);
    if let Ok(canonical_workspace) = PathBuf::from(&workspace).canonicalize() {
        if let Ok(canonical_target) = full_path.canonicalize() {
            if !canonical_target.starts_with(&canonical_workspace) {
                return Err("Access denied: path is outside workspace".to_string());
            }
        }
    }
    fs::read_to_string(&full_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file_content(workspace: String, relative_path: String, content: String) -> Result<(), String> {
    let full_path = PathBuf::from(&workspace).join(&relative_path);
    if let Some(parent) = full_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&full_path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn run_project_command(workspace: String, command: String) -> Result<CommandResult, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("powershell")
            .args(["-NoProfile", "-Command", &command])
            .current_dir(&workspace)
            .output()
    } else {
        Command::new("sh")
            .arg("-c")
            .arg(&command)
            .current_dir(&workspace)
            .output()
    }.map_err(|e| format!("Failed to execute command: {}", e))?;

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success(),
    })
}

#[tauri::command]
async fn is_browser_cdp_ready() -> bool {
    if let Ok(addr) = "127.0.0.1:9222".parse() {
        TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
    } else {
        false
    }
}

#[tauri::command]
async fn get_browser_targets() -> Result<String, String> {
    use std::io::{Read, Write};
    let addr = "127.0.0.1:9222"
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800))
        .map_err(|e| format!("CDP port 9222 not reachable: {}", e))?;

    stream
        .set_read_timeout(Some(Duration::from_millis(1000)))
        .map_err(|e| e.to_string())?;

    let req = "GET /json HTTP/1.1\r\nHost: 127.0.0.1:9222\r\nConnection: close\r\n\r\n";
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    let mut response = Vec::new();
    let mut buf = [0u8; 4096];

    for _ in 0..25 {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                response.extend_from_slice(&buf[..n]);
                let resp_str = String::from_utf8_lossy(&response);
                if let Some(pos) = resp_str.find("\r\n\r\n") {
                    let headers = &resp_str[..pos];
                    let body = &resp_str[pos + 4..];

                    // Check Content-Length header to return immediately without waiting for socket close
                    if let Some(cl_idx) = headers.to_lowercase().find("content-length:") {
                        let after = &headers[cl_idx + 15..];
                        if let Some(end_line) = after.find("\r\n") {
                            if let Ok(expected_len) = after[..end_line].trim().parse::<usize>() {
                                if body.as_bytes().len() >= expected_len {
                                    return Ok(body[..expected_len].trim().to_string());
                                }
                            }
                        }
                    } else if body.trim().starts_with('[') && body.trim().ends_with(']') {
                        return Ok(body.trim().to_string());
                    }
                }
            }
            Err(_) => {
                let resp_str = String::from_utf8_lossy(&response);
                if let Some(pos) = resp_str.find("\r\n\r\n") {
                    let body = resp_str[pos + 4..].trim();
                    if body.starts_with('[') {
                        return Ok(body.to_string());
                    }
                }
                break;
            }
        }
    }

    let resp_str = String::from_utf8_lossy(&response);
    if let Some(pos) = resp_str.find("\r\n\r\n") {
        Ok(resp_str[pos + 4..].trim().to_string())
    } else {
        Ok(resp_str.trim().to_string())
    }
}

#[tauri::command]
async fn sync_chrome_profile() -> Result<bool, String> {
    let temp_dir = std::env::temp_dir();
    let target_profile = temp_dir.join("llmconductor-chrome-profile");
    let target_default = target_profile.join("Default");
    let target_network = target_default.join("Network");

    let _ = fs::create_dir_all(&target_network);

    let src_user_data = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(|l| PathBuf::from(l).join(r"Google\Chrome\User Data"))
    } else if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library/Application Support/Google/Chrome"))
    } else {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".config/google-chrome"))
    };

    if let Some(src_root) = src_user_data {
        if src_root.exists() {
            // 1. Copy Local State (contains DPAPI decryption key for Chrome)
            let src_local_state = src_root.join("Local State");
            let dst_local_state = target_profile.join("Local State");
            if src_local_state.exists() {
                let _ = fs::copy(&src_local_state, &dst_local_state);
            }

            // 2. Copy Preferences, Secure Preferences, Login Data, Web Data (stores user Google Account identity & logins)
            for fname in &["Preferences", "Secure Preferences", "Login Data", "Web Data"] {
                let src_f = src_root.join("Default").join(fname);
                let dst_f = target_default.join(fname);
                if src_f.exists() {
                    let _ = fs::copy(&src_f, &dst_f);
                }
            }

            // 3. Copy Default/Network/Cookies
            let src_cookies = src_root.join("Default").join("Network").join("Cookies");
            let dst_cookies = target_network.join("Cookies");
            if src_cookies.exists() {
                let _ = fs::copy(&src_cookies, &dst_cookies);
            }

            // 4. Copy Default/Local Storage if available
            let src_ls = src_root.join("Default").join("Local Storage");
            let dst_ls = target_default.join("Local Storage");
            if src_ls.exists() {
                let _ = fs::create_dir_all(&dst_ls);
                if let Ok(entries) = fs::read_dir(&src_ls) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let _ = fs::copy(&path, dst_ls.join(entry.file_name()));
                        }
                    }
                }
            }
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
async fn open_in_browser(url: String) -> Result<(), String> {
    let _ = sync_chrome_profile().await;
    let temp_dir = std::env::temp_dir();
    let profile_dir = temp_dir.join("llmconductor-chrome-profile");
    let profile_arg = format!("--user-data-dir={}", profile_dir.to_string_lossy());

    let cdp_args = [
        "--remote-debugging-port=9222",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
    ];

    if cfg!(target_os = "windows") {
        let chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
        let chrome_x86_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
        let edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";

        let target_browser = if Path::new(chrome_path).exists() {
            Some(chrome_path)
        } else if Path::new(chrome_x86_path).exists() {
            Some(chrome_x86_path)
        } else if Path::new(edge_path).exists() {
            Some(edge_path)
        } else {
            None
        };

        if let Some(exe) = target_browser {
            let mut cmd = Command::new(exe);
            cmd.args(cdp_args);
            cmd.arg(&profile_arg);
            cmd.arg(&url);
            cmd.spawn().map_err(|e| e.to_string())?;
        } else {
            Command::new("cmd")
                .args(["/c", "start", &url])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    } else if cfg!(target_os = "macos") {
        let mut cmd = Command::new("open");
        cmd.args(["-a", "Google Chrome", "--args"]);
        cmd.args(cdp_args);
        cmd.arg(&profile_arg);
        cmd.arg(&url);
        if cmd.spawn().is_err() {
            Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
        }
    } else {
        let mut cmd = Command::new("google-chrome");
        cmd.args(cdp_args);
        cmd.arg(&profile_arg);
        cmd.arg(&url);
        if cmd.spawn().is_err() {
            Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let icon_bytes = include_bytes!("../icons/icon.png");
                    if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                        let _ = window.set_icon(icon);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            list_project_files,
            read_file_content,
            write_file_content,
            run_project_command,
            open_in_browser,
            is_browser_cdp_ready,
            get_browser_targets,
            sync_chrome_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


