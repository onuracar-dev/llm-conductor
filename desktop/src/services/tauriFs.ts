import { invoke } from "@tauri-apps/api/core";
import { WorkspaceFile } from "../types";

export interface ShellCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export async function pickProjectFolder(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("pick_project_folder");
    return result;
  } catch (error) {
    console.warn("Tauri pick_project_folder fallback:", error);
    return null;
  }
}

export async function listProjectFiles(
  root: string,
  maxFiles = 400
): Promise<WorkspaceFile[]> {
  try {
    const files = await invoke<WorkspaceFile[]>("list_project_files", {
      root,
      maxFiles,
    });
    return files;
  } catch (error) {
    console.warn("Tauri list_project_files error:", error);
    return [];
  }
}

export async function readFileContent(
  workspace: string,
  relativePath: string
): Promise<string> {
  return await invoke<string>("read_file_content", {
    workspace,
    relativePath,
  });
}

export async function writeFileContent(
  workspace: string,
  relativePath: string,
  content: string
): Promise<void> {
  return await invoke<void>("write_file_content", {
    workspace,
    relativePath,
    content,
  });
}

export async function runProjectCommand(
  workspace: string,
  command: string
): Promise<ShellCommandResult> {
  return await invoke<ShellCommandResult>("run_project_command", {
    workspace,
    command,
  });
}

export async function isBrowserCdpReady(): Promise<boolean> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      return await invoke<boolean>("is_browser_cdp_ready");
    } catch {
      return false;
    }
  }
  return false;
}

export async function getBrowserTargets(): Promise<any[] | null> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const jsonStr = await invoke<string>("get_browser_targets");
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch("http://127.0.0.1:9222/json");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncChromeProfile(): Promise<boolean> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      return await invoke<boolean>("sync_chrome_profile");
    } catch {
      return false;
    }
  }
  return false;
}

export async function openExternalUrl(url: string): Promise<void> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      await invoke("open_in_browser", { url });
      return;
    } catch {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
        return;
      } catch (err) {
        console.warn("Tauri openUrl error:", err);
      }
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}


