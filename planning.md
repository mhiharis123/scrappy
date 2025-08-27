# Web Scraping Web App — Core Planning Document

## 1. Project Overview

The goal is to build a modern web application that enables users to perform web scraping tasks with flexible options:

* **Crawl4ai** integration for scraping.
* Optional **LLM-powered scraping** for structured and user-defined outputs.
* Results presented in **Markdown** and **JSON** formats within a single container, mimicking Firecrawl's style.
* A user-friendly **UI/UX design** that is intuitive, modern, and visually appealing.

---

## 2. Core Features

### 2.1 Scraping Modes

1. **Standard Mode (Crawl4ai only)**

   * Directly scrape websites.
   * Output in Markdown + JSON format.
   * Results shown in one container.

2. **LLM-Enhanced Mode**

   * Users can toggle a switch to enable LLM.
   * Text input appears for users to provide a **custom prompt** describing the desired structure of the result.
   * User can select a model from **OpenRouter API** models.
   * Outputs refined with LLM, still delivered in Markdown + JSON format in one container.

---

### 2.2 Output Formatting

* **Single container display** combining:

  * Markdown view (for readable presentation).
  * JSON view (for structured data).
* Mimics **Firecrawl** container style for consistency and familiarity.

---

### 2.3 Model Selection (LLM Mode)

* Integration with **OpenRouter API**.
* Fetch available models dynamically (via API).
* Allow user to select model from a dropdown.
* Use **OPENROUTER\_API\_KEY** for authentication.

---

### 2.4 User Interface / User Experience

* **Modern design principles:**

  * Clean layout with grid/flexbox.
  * Responsive design for desktop and mobile.
  * Dark/light mode toggle.
* **Components:**

  * Input field for URL.
  * Toggle switch for LLM mode.
  * Prompt text box (appears only in LLM mode).
  * Dropdown for model selection (LLM mode only).
  * "Scrap" button with loading indicator.
  * Result container (Markdown + JSON tabs).

---

## 3. Technical Architecture

### 3.1 Frontend

* **Framework:** React (with Tailwind CSS for styling).
* **UI libraries:** shadcn/ui components, lucide-react icons.
* **State management:** React hooks (or Zustand if needed).
* **Result container:** Tabs for Markdown/JSON.

### 3.2 Backend

* **Server framework:** Node.js (Express or Fastify).
* **Scraping engine:** Crawl4ai.
* **LLM integration:** OpenRouter API for LLM calls when enabled.

### 3.3 API Flow

1. User submits URL (and optional LLM settings).
2. Backend calls Crawl4ai for raw scrape.
3. If LLM mode is enabled:

   * Pass scraped data + user prompt to OpenRouter API.
   * Receive structured response.
4. Return Markdown + JSON in one payload.

---

## 4. Security & Reliability

* Secure **API key management** (OPENROUTER\_API\_KEY in server-side env variables).
* Input sanitization to prevent injection attacks.
* Error handling with graceful fallback (if LLM fails, return raw Crawl4ai result).
* Loading indicators and user feedback for long operations.

---

## 6. References

* Crawl4ai Docs: [https://docs.crawl4ai.com/](https://docs.crawl4ai.com/)
* OpenRouter API Docs: [https://openrouter.ai/docs/api-reference/list-available-models](https://openrouter.ai/docs/api-reference/list-available-models)
