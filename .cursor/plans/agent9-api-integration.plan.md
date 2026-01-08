# Agent 9.1: Marketplace API Integration

> **Priority:** Medium (required before marketplace.blueplm.io goes live)

> **Estimated Effort:** 2-4 hours

> **Repository:** `blueplm-site`

---

## Context

Agent 9 completed the marketplace frontend with mock data while Agent 8 was building the Store API in parallel. Now that both are complete, this follow-up task connects them.

**Reference:** See Wave 4 Readiness Report at `bluePLM/.cursor/plans/wave-4-readiness-report.md`

---

## Objective

Replace hardcoded mock data in the marketplace frontend with real API calls to the Store API (Agent 8).

---

## Files to Create

### `blueplm-site/src/lib/api.ts`

Create an API client:

```typescript
const API_BASE = import.meta.env.VITE_STORE_API_URL || '/api';

export interface SearchParams {
  q?: string;
  category?: string;
  verified?: boolean;
  sort?: 'popular' | 'recent' | 'name' | 'downloads';
  limit?: number;
  offset?: number;
}

export async function fetchExtensions(params: SearchParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.category) searchParams.set('category', params.category);
  if (params.verified) searchParams.set('verified', 'true');
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));
  
  const response = await fetch(`${API_BASE}/store/extensions?${searchParams}`);
  if (!response.ok) throw new Error('Failed to fetch extensions');
  return response.json();
}

export async function fetchExtension(id: string) {
  const response = await fetch(`${API_BASE}/store/extensions/${id}`);
  if (!response.ok) throw new Error('Extension not found');
  return response.json();
}

export async function fetchExtensionVersions(id: string) {
  const response = await fetch(`${API_BASE}/store/extensions/${id}/versions`);
  if (!response.ok) throw new Error('Failed to fetch versions');
  return response.json();
}

export async function fetchPublisher(id: string) {
  const response = await fetch(`${API_BASE}/store/publishers/${id}`);
  if (!response.ok) throw new Error('Publisher not found');
  return response.json();
}

export async function fetchFeatured() {
  const response = await fetch(`${API_BASE}/store/featured`);
  if (!response.ok) throw new Error('Failed to fetch featured');
  return response.json();
}

export async function fetchCategories() {
  const response = await fetch(`${API_BASE}/store/categories`);
  if (!response.ok) throw new Error('Failed to fetch categories');
  return response.json();
}
```

---

## Files to Modify

### 1. `blueplm-site/src/pages/marketplace/Index.tsx`

**Current:** Uses `mockExtensions` array (lines 11-102)

**Change:**

- Remove mock data
- Add `useEffect` to fetch extensions from API
- Add loading and error states
- Use `fetchExtensions()`, `fetchFeatured()`, `fetchCategories()`

### 2. `blueplm-site/src/pages/marketplace/Extension.tsx`

**Current:** Uses `mockExtensionDetails` object (line 14+)

**Change:**

- Remove mock data
- Add `useEffect` to fetch extension by ID from `useParams()`
- Add loading and error states
- Use `fetchExtension()`, `fetchExtensionVersions()`

### 3. `blueplm-site/src/pages/marketplace/Publisher.tsx`

**Current:** Uses mock publisher data

**Change:**

- Remove mock data
- Add `useEffect` to fetch publisher by ID
- Add loading and error states
- Use `fetchPublisher()`

### 4. `blueplm-site/src/pages/marketplace/Submit.tsx`

**Current:** Form with no submission logic

**Change:**

- Add form submission to `POST /store/extensions`
- Add authentication check (redirect if not authenticated)
- Add success/error handling

---

## Optional: Add Environment Variable

Create or update `blueplm-site/.env.example`:

```
VITE_STORE_API_URL=https://api.blueplm.io
```

For local development, the API runs at the same origin via Vite proxy or Cloudflare Pages functions.

---

## Testing Checklist

- [ ] Browse page loads extensions from API
- [ ] Search filters work with API params
- [ ] Extension detail page loads from API
- [ ] Publisher page loads from API
- [ ] Error states display properly when API fails
- [ ] Loading states display during fetch

---

## Notes

- Keep the existing UI components unchanged - only the data fetching changes
- The ExtensionCard, SearchFilters, and other components already expect the correct data shape
- If the API isn't deployed yet, you can test against the local dev server (`npm run dev` in `blueplm-site/api/`)

---

## When Complete

Update `blueplm-site/AGENT9_MARKETPLACE_REPORT.md` to note the integration is complete.