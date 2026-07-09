# 🚂 LLM Conductor

A lightweight, unified, and type-safe wrapper for managing prompts, chat history, and structured outputs across multiple LLM providers.

## Project Snapshot

LLM Conductor is a TypeScript library for building provider-agnostic LLM flows with conversation history and Zod-backed structured output. It is positioned for AI product work where OpenAI, Anthropic, and Gemini should be swappable behind one developer-facing API.

- **Core idea:** one fluent interface for chat, history, schemas, and provider-specific structured output behavior.
- **Recent hardening:** schema conversion now fails loudly when the installed Zod version cannot expose JSON Schema conversion instead of silently returning an empty schema.
- **Validation:** `npm test` and `npm run build`.

[Türkçe açıklamalar için aşağı kaydırın.](#türkçe)

---

## 🇺🇸 English

### What is it?
`llm-conductor` is an LLM/AI Prompt Manager library designed to streamline your interactions with language models. 

### What problem does it solve?
When building AI applications, developers often face a few common headaches:
1. **API Inconsistencies:** OpenAI, Anthropic, and Gemini all have different API shapes, requiring you to write provider-specific logic.
2. **History Management:** Managing `system`, `user`, and `assistant` message chains manually can get messy.
3. **Structured Outputs:** Forcing an LLM to return a strictly typed JSON object and parsing it safely is difficult.

`llm-conductor` solves these by providing a unified builder pattern, automatic history management, and native integration with `zod` for perfectly typed structured outputs.

### Installation

Install the package alongside `zod` (required for structured schemas):

```bash
npm install llm-conductor zod
# or
yarn add llm-conductor zod
# or
pnpm add llm-conductor zod
```

### Usage

#### 1. Basic Chat
You can easily chain messages and keep the context alive.

```typescript
import { Conductor } from "llm-conductor";

const bot = new Conductor({
  provider: "openai", // Supported: "openai" | "anthropic" | "gemini"
  apiKey: process.env.OPENAI_API_KEY
});

async function main() {
  const reply = await bot
    .system("You are a helpful assistant.")
    .user("Hi! What is 2+2?")
    .run();

  console.log(reply); // "2+2 is 4."
  
  // The context is preserved automatically
  const reply2 = await bot.user("Multiply that by 3.").run();
  console.log(reply2); // "The result is 12."
}
```

#### 2. Structured Output with Zod (Type-Safe)
You can force the LLM to return a specific JSON structure. The response will be automatically parsed and strictly typed.

```typescript
import { Conductor } from "llm-conductor";
import { z } from "zod";

const bot = new Conductor({
  provider: "gemini", 
  apiKey: process.env.GEMINI_API_KEY
});

const UserProfileSchema = z.object({
  name: z.string().describe("The user's full name"),
  age: z.number(),
  hobbies: z.array(z.string())
});

async function generateProfile() {
  // `result` will be fully typed as { name: string, age: number, hobbies: string[] }
  const result = await bot
    .user("Generate a random user profile for a developer.")
    .withSchema(UserProfileSchema)
    .run();

  console.log(`Name: ${result.name}, Age: ${result.age}`);
}
```

### Supported Providers
- **OpenAI** (`gpt-4o`, etc.) - Leverages native `json_schema` response formats.
- **Anthropic** (`claude-3-5-sonnet-20240620`, etc.) - Leverages tool usage.
- **Google Gemini** (`gemini-1.5-flash`, etc.) - Leverages `responseSchema`.

---

## 🇹🇷 Türkçe

### Nedir?
`llm-conductor`, dil modelleriyle (LLM) olan etkileşimlerinizi standartlaştırmak ve kolaylaştırmak için tasarlanmış bir Prompt Yöneticisi kütüphanesidir.

### Hangi Sorunu Çözer?
Yapay zeka entegrasyonu yaparken geliştiriciler genelde şu sorunlarla karşılaşır:
1. **API Farklılıkları:** OpenAI, Anthropic ve Gemini API'lerinin yapıları birbirinden tamamen farklıdır. Her biri için ayrı kod yazmak gerekir.
2. **Geçmiş (History) Yönetimi:** `system`, `user` ve `assistant` mesajlarını bir zincir halinde tutmak ve modelle konuşmayı sürdürmek zahmetlidir.
3. **Yapısal Çıktı (Structured Outputs):** Modeli rastgele bir metin yerine katı kurallara sahip bir JSON objesi döndürmeye zorlamak ve bunu güvenli bir şekilde işlemek zordur.

`llm-conductor`, tek bir standart arayüz, otomatik mesaj geçmişi yönetimi ve mükemmel tip güvenliği sağlayan yerleşik `zod` entegrasyonu ile bu sorunları tamamen ortadan kaldırır.

### Kurulum

Kütüphaneyi ve yapısal şemalar için gereken `zod` paketini projenize dahil edin:

```bash
npm install llm-conductor zod
# veya
yarn add llm-conductor zod
# veya
pnpm add llm-conductor zod
```

### Kullanım

#### 1. Basit Sohbet
Mesajları kolayca birbirine bağlayıp bağlamı (context) koruyabilirsiniz.

```typescript
import { Conductor } from "llm-conductor";

const bot = new Conductor({
  provider: "openai", // Desteklenenler: "openai" | "anthropic" | "gemini"
  apiKey: process.env.OPENAI_API_KEY
});

async function main() {
  const cevap = await bot
    .system("Sen yardımsever bir asistansın.")
    .user("Merhaba! 2+2 kaçtır?")
    .run();

  console.log(cevap); // "2+2, 4'tür."
  
  // Konuşma geçmişi otomatik olarak saklanır
  const cevap2 = await bot.user("Bunu 3 ile çarp.").run();
  console.log(cevap2); // "Sonuç 12'dir."
}
```

#### 2. Zod ile Yapısal Çıktı (Tip Güvenli)
LLM'i belirli bir JSON yapısı döndürmeye zorlayabilirsiniz. Dönen cevap otomatik olarak parse edilir ve Typescript üzerinde tam uyumlu (strongly-typed) olur.

```typescript
import { Conductor } from "llm-conductor";
import { z } from "zod";

const bot = new Conductor({
  provider: "anthropic", 
  apiKey: process.env.ANTHROPIC_API_KEY
});

const KullaniciSemasi = z.object({
  isim: z.string(),
  yas: z.number(),
  hobiler: z.array(z.string())
});

async function profilOlustur() {
  // `sonuc` objesi doğrudan { isim: string, yas: number, hobiler: string[] } tipinde olacaktır.
  const sonuc = await bot
    .user("Bana bir yazılımcı için rastgele kullanıcı profili oluştur.")
    .withSchema(KullaniciSemasi)
    .run();

  console.log(`İsim: ${sonuc.isim}, Yaş: ${sonuc.yas}`);
}
```

### Desteklenen Sağlayıcılar
- **OpenAI** (`gpt-4o`, vb.) - Native `json_schema` özelliği ile.
- **Anthropic** (`claude-3-5-sonnet-20240620`, vb.) - Tool kullanımı (tool usage) ile.
- **Google Gemini** (`gemini-1.5-flash`, vb.) - Native `responseSchema` özelliği ile.
