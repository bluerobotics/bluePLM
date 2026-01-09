# Troubleshooting

This guide covers common issues and solutions when developing BluePLM extensions.

## Development Issues

### Extension Not Loading

**Symptoms:**
- Extension doesn't appear in settings
- No activation messages in console
- Commands not available

**Solutions:**

1. **Check manifest validity**
   ```bash
   # Validate manifest
   npx ajv validate -s schemas/extension-v1.schema.json -d extension.json
   ```

2. **Verify entry point exists**
   ```json
   // extension.json
   "main": "client/index.js"  // This file must exist
   ```

3. **Check for syntax errors in code**
   ```bash
   npm run typecheck
   npm run build
   ```

4. **Check activation events**
   ```json
   // At least one activation event required
   "activationEvents": ["onExtensionEnabled"]
   ```

5. **View logs**
   - Open DevTools: `Ctrl+Shift+I`
   - Check Console for errors
   - Check Network tab for failed requests

---

### Commands Not Registering

**Symptoms:**
- Command not in command palette
- Keybinding doesn't work
- "Command not found" error

**Solutions:**

1. **Verify command is declared in manifest**
   ```json
   "contributes": {
     "commands": [
       {
         "id": "myext.sync",  // Must match registerCommand
         "title": "Sync Files"
       }
     ]
   }
   ```

2. **Check command registration in code**
   ```typescript
   // ID must match manifest
   api.commands.registerCommand('myext.sync', handler)
   ```

3. **Verify permissions**
   ```json
   "permissions": {
     "client": ["commands:register"]
   }
   ```

4. **Check `when` condition**
   ```json
   {
     "id": "myext.sync",
     "when": "vault.isOpen"  // Command only available when vault is open
   }
   ```

---

### Storage Not Persisting

**Symptoms:**
- Settings lost after restart
- `storage.get` returns undefined

**Solutions:**

1. **Check permission**
   ```json
   "permissions": {
     "client": ["storage:local"]
   }
   ```

2. **Ensure value is JSON-serializable**
   ```typescript
   // ✓ Good: Plain objects
   await api.storage.set('config', { autoSync: true })
   
   // ❌ Bad: Functions, Maps, Sets, etc.
   await api.storage.set('handler', myFunction)  // Won't work
   ```

3. **Verify key names**
   ```typescript
   await api.storage.set('myKey', value)
   const result = await api.storage.get('myKey')  // Same key
   ```

4. **Check for errors**
   ```typescript
   try {
     await api.storage.set('key', value)
   } catch (error) {
     console.error('Storage error:', error)
   }
   ```

---

### API Calls Failing

**Symptoms:**
- 401/403 errors from `callOrgApi`
- Network errors
- Timeout errors

**Solutions:**

1. **Check authentication**
   ```typescript
   // Ensure user is logged in
   if (!api.context.user) {
     api.ui.showToast('Please log in first', 'error')
     return
   }
   ```

2. **Verify endpoint exists**
   ```json
   // Manifest must declare the route
   "contributes": {
     "apiRoutes": [
       {
         "method": "POST",
         "path": "sync",       // Endpoint: /extensions/myext/sync
         "handler": "server/sync.js"
       }
     ]
   }
   ```

3. **Check network permission**
   ```json
   "permissions": {
     "client": ["network:orgApi"]
   }
   ```

4. **Increase timeout for slow operations**
   ```typescript
   const response = await api.callOrgApi('/extensions/myext/sync', {
     timeout: 60000  // 60 seconds
   })
   ```

5. **Check server handler for errors**
   - View org API logs
   - Add logging in handler
   - Check for uncaught exceptions

---

## Server Handler Issues

### Handler Not Found

**Symptoms:**
- 404 error when calling endpoint
- "Route not found" error

**Solutions:**

1. **Verify handler path**
   ```json
   "contributes": {
     "apiRoutes": [
       {
         "method": "POST",
         "path": "sync",
         "handler": "server/sync.js"  // Must match actual file
       }
     ]
   }
   ```

2. **Check handler exports**
   ```typescript
   // server/sync.ts
   export default async function handler(api) {
     // Must be default export
   }
   ```

3. **Ensure extension is installed on org**
   - Extension must be installed in organization
   - Check org extension list

---

### Domain Not Allowed

**Symptoms:**
- "Domain not in allowed domains" error
- HTTP requests fail

**Solutions:**

1. **Declare domain in permissions**
   ```json
   "permissions": {
     "server": [
       "http:domain:api.example.com",
       "http:domain:auth.example.com"
     ]
   }
   ```

2. **Use exact domain**
   ```typescript
   // Permission: http:domain:api.example.com
   
   await api.http.fetch('https://api.example.com/data')  // ✓ Works
   await api.http.fetch('https://example.com/data')      // ✗ Different domain
   ```

3. **Check protocol**
   ```typescript
   // Always use HTTPS
   await api.http.fetch('https://api.example.com/data')  // ✓ Good
   await api.http.fetch('http://api.example.com/data')   // May fail
   ```

---

### Secrets Not Working

**Symptoms:**
- `secrets.get` returns undefined
- "Permission denied" errors

**Solutions:**

1. **Check permissions**
   ```json
   "permissions": {
     "server": ["secrets:read", "secrets:write"]
   }
   ```

2. **Verify secret was stored**
   ```typescript
   // Must set before getting
   await api.secrets.set('api_key', 'value')
   const key = await api.secrets.get('api_key')  // Now works
   ```

3. **Check secret limits**
   - Maximum 50 secrets per extension
   - Maximum 10KB per secret

---

## Build Issues

### TypeScript Errors

**Common errors and fixes:**

```typescript
// Error: Cannot find module '@blueplm/extension-api'
// Fix: Install types package or use local types
npm install @blueplm/extension-api --save-dev

// Or create local type file:
// types/extension-api.d.ts
declare module '@blueplm/extension-api' {
  export interface ExtensionContext { ... }
  export interface ExtensionClientAPI { ... }
}
```

```typescript
// Error: Type 'unknown' is not assignable to type 'X'
// Fix: Add type assertion or validation
const body = api.request.body as { vaultId: string }

// Better: Validate the type
function isValidBody(body: unknown): body is { vaultId: string } {
  return typeof body === 'object' && body !== null && 'vaultId' in body
}
```

---

### Bundle Size Too Large

**Symptoms:**
- Package over 10MB limit
- Slow extension load times

**Solutions:**

1. **Enable minification**
   ```bash
   esbuild ... --minify
   ```

2. **Externalize React**
   ```bash
   esbuild ... --external:react --external:react-dom
   ```

3. **Tree shake unused code**
   ```typescript
   // ✓ Good: Named import
   import { specificFunction } from 'large-library'
   
   // ❌ Bad: Imports entire library
   import * as library from 'large-library'
   ```

4. **Check bundle analysis**
   ```bash
   esbuild ... --metafile=meta.json
   # Analyze meta.json to find large dependencies
   ```

5. **Lazy load components**
   ```typescript
   const HeavyComponent = React.lazy(() => import('./HeavyComponent'))
   ```

---

## Runtime Issues

### Memory Leaks

**Symptoms:**
- Extension slows down over time
- High memory usage
- Watchdog warnings

**Solutions:**

1. **Clean up intervals/timeouts**
   ```typescript
   let intervalId: ReturnType<typeof setInterval>
   
   export function activate(context, api) {
     intervalId = setInterval(task, 5000)
     
     // Register cleanup
     context.subscriptions.push({
       dispose: () => clearInterval(intervalId)
     })
   }
   ```

2. **Remove event listeners**
   ```typescript
   // Use subscriptions for auto-cleanup
   context.subscriptions.push(
     api.workspace.onFileChanged(handler)  // Auto-disposed
   )
   ```

3. **Clear caches**
   ```typescript
   const cache = new Map<string, Data>()
   
   // Limit cache size
   function addToCache(key: string, value: Data) {
     if (cache.size > 100) {
       const firstKey = cache.keys().next().value
       cache.delete(firstKey)
     }
     cache.set(key, value)
   }
   ```

---

### Extension Crashes

**Symptoms:**
- Extension stops working
- Error messages in console
- Watchdog kills extension

**Solutions:**

1. **Add error boundaries**
   ```typescript
   export async function activate(context, api) {
     try {
       await initialize(api)
     } catch (error) {
       context.log.error('Failed to activate:', error)
       api.ui.showToast('Extension failed to load', 'error')
       // Don't throw - allow graceful degradation
     }
   }
   ```

2. **Handle async errors**
   ```typescript
   context.subscriptions.push(
     api.workspace.onFileChanged(async (events) => {
       try {
         await handleFileChanges(events)
       } catch (error) {
         context.log.error('File handler error:', error)
         // Don't crash on individual file errors
       }
     })
   )
   ```

3. **Check memory limits**
   - Default: 50MB per extension
   - Reduce memory usage or request increase

---

## UI Issues

### View Not Rendering

**Symptoms:**
- Blank panel
- Component errors
- "Cannot read property of undefined"

**Solutions:**

1. **Check component path**
   ```json
   "contributes": {
     "views": [{
       "component": "client/components/Panel.js"  // Must match
     }]
   }
   ```

2. **Verify React component**
   ```tsx
   // Must be default export
   export default function Panel({ api }: { api: ExtensionClientAPI }) {
     return <div>Content</div>
   }
   ```

3. **Handle loading states**
   ```tsx
   function Panel({ api }) {
     const [loading, setLoading] = useState(true)
     const [data, setData] = useState(null)
     
     useEffect(() => {
       api.storage.get('data')
         .then(setData)
         .finally(() => setLoading(false))
     }, [api])
     
     if (loading) return <div>Loading...</div>
     if (!data) return <div>No data</div>
     return <div>{/* render data */}</div>
   }
   ```

---

### Styling Issues

**Symptoms:**
- Styles not applied
- Theme conflicts
- Layout broken

**Solutions:**

1. **Use Tailwind classes** (provided by host)
   ```tsx
   <div className="p-4 bg-white dark:bg-gray-800">
     <h2 className="text-lg font-semibold">Title</h2>
   </div>
   ```

2. **Scope custom CSS**
   ```css
   /* Scope to your extension */
   .myext-panel {
     /* your styles */
   }
   ```

3. **Support dark mode**
   ```tsx
   <div className="bg-white dark:bg-gray-900 text-black dark:text-white">
   ```

---

## Getting Help

### Debug Information to Collect

When reporting issues, include:

1. **Extension manifest** (without secrets)
2. **Error messages** from console
3. **BluePLM version** (`Help → About`)
4. **OS version**
5. **Steps to reproduce**

### Logging

Add comprehensive logging:

```typescript
export async function activate(context, api) {
  context.log.info('Extension starting...')
  context.log.debug('Config:', await api.storage.get('config'))
  
  try {
    await initialize(api)
    context.log.info('Extension ready')
  } catch (error) {
    context.log.error('Initialization failed:', error)
  }
}
```

### Where to Get Help

1. **Documentation** — You're here!
2. **GitHub Issues** — [bluerobotics/bluePLM](https://github.com/bluerobotics/bluePLM/issues)
3. **Email** — extensions@bluerobotics.com

---

## Quick Reference

| Issue | Common Cause | Quick Fix |
|-------|--------------|-----------|
| Extension not loading | Invalid manifest | Validate with JSON Schema |
| Commands not working | Missing permission | Add `commands:register` |
| Storage not persisting | Non-serializable value | Use plain objects |
| API calls failing | Missing auth | Check `api.context.user` |
| Handler 404 | Wrong path | Match manifest route |
| Domain blocked | Not declared | Add `http:domain:*` |
| Memory leak | Missing cleanup | Use `context.subscriptions` |
| Bundle too large | Not minified | Enable minification |

---

**[← Best Practices](./best-practices.md)**
