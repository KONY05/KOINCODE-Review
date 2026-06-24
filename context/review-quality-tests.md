# Review Agent Quality Tests

Test cases for evaluating the review agent's ability to catch real-world issues. Each case targets a specific category and severity level. Use these against the test repo (`KONY05/todo-app-testing`) to verify the model flags each issue correctly.

## Test Cases

### 1. ReDoS via unsanitized regex in search

**Category:** Security (ReDoS) | **Severity:** High | **Tests:** Input sanitization awareness

Pre-existing bug — not in the diff. A user typing `((((((((` into the search box creates a regex that causes catastrophic backtracking.

```jsx
const visibleTodos = useMemo(() => {
  let filtered = todos;

  if (filter === "active") {
    filtered = filtered.filter((todo) => !todo.completed);
  } else if (filter === "completed") {
    filtered = filtered.filter((todo) => todo.completed);
  }

  if (search) {
    const pattern = new RegExp(search, "i");
    filtered = filtered.filter((todo) => pattern.test(todo.text));
  }

  return filtered;
}, [filter, todos, search]);
```

**Expected flag:** `search` is passed directly to `new RegExp()` without escaping — ReDoS-vulnerable.

---

### 2. State corruption in toggleTodo

**Category:** Logic bug | **Severity:** High | **Tests:** React state update patterns

Pre-existing bug. The function calls `setTodos` twice: once with a functional updater (correct) and once with a stale `todos` snapshot, which overwrites the first call.

```jsx
function toggleTodo(id: string) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  }
  setTodos([...todos]);
}
```

**Expected flag:** Stale closure / double state setter — the second `setTodos` call undoes the first.

---

### 3. XSS via dangerouslySetInnerHTML

**Category:** Security (XSS) | **Severity:** Critical | **Tests:** Dangerous API misuse

Diff change — replace the todo text span with:

```jsx
<span
  className="todo-text"
  dangerouslySetInnerHTML={{ __html: todo.text }}
  onDoubleClick={() => startEditing(todo)}
/>
```

**Expected flag:** User-controlled `todo.text` rendered as raw HTML = stored XSS.

---

### 4. Loose equality check

**Category:** Style / correctness | **Severity:** Low | **Tests:** Nuance around `==` vs `===`

Pre-existing code. While `== null` works (catches both `null` and `undefined`), a reviewer testing strictness rules should evaluate whether this is intentional.

```jsx
function commitEdit() {
  if (editingId == null) return;
  const trimmed = editText.trim();
  if (trimmed) {
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === editingId ? { ...todo, text: trimmed } : todo,
      ),
    );
  }
  setEditingId(null);
  setEditText("");
}
```

**Expected flag:** Use `=== null` — or note the intentional `== null` idiom and don't flag it. Tests reviewer nuance.

---

### 5. Missing key in list or duplicate keys

**Category:** React correctness | **Severity:** Medium | **Tests:** Key prop uniqueness

Diff change — change the key prop on todo items:

```jsx
<li key={todo.text}> // instead of key={todo.id}
```

**Expected flag:** Two todos with the same text produce duplicate keys, causing React reconciliation bugs.

---

### 6. Secrets / API keys leaked in code

**Category:** Security (secrets) | **Severity:** Critical | **Tests:** Secret detection

Diff change — add to the file:

```jsx
const API_KEY = "sk-proj-abc123def456ghi789";
const ANALYTICS_ENDPOINT = `https://api.example.com/track?key=${API_KEY}`;
```

**Expected flag:** Hardcoded secret/API key should be in environment variables, not source code.

---

### 7. Performance: expensive computation in render path

**Category:** Performance | **Severity:** Medium | **Tests:** Memoization awareness

Diff change — add inside the component, outside `useMemo`:

```jsx
const sortedTodos = [...todos].sort((a, b) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
);
// Then use sortedTodos in JSX
```

**Expected flag:** Sorting on every render without `useMemo` — should be memoized since `todos` is the only dependency.

---

### 8. Broken error handling that silently swallows data

**Category:** Data safety | **Severity:** High | **Tests:** Destructive error handling

Diff change — replace `loadTodos`:

```jsx
function loadTodos(): Todo[] {
  try {
    const storedTodos = localStorage.getItem(STORAGE_KEY);
    if (!storedTodos) return [];
    const parsedTodos = JSON.parse(storedTodos);
    if (!Array.isArray(parsedTodos)) return [];
    return parsedTodos; // removed the .filter() validation
  } catch {
    localStorage.removeItem(STORAGE_KEY); // silently wipes user data on any parse error
    return [];
  }
}
```

**Expected flag:** Destructive error handling — a transient error (e.g., corrupt single entry) nukes all saved data. Also, removing the validation filter lets malformed objects through.

---

### 9. Race condition / stale closure in async operation

**Category:** Async correctness | **Severity:** Medium | **Tests:** Error handling + race conditions

Diff change — add async submit handler:

```jsx
async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const text = draft.trim();
  if (!text) return;

  await fetch("/api/todos", { method: "POST", body: JSON.stringify({ text }) });

  setTodos((currentTodos) => [
    { id: createTodoId(), text, completed: false, createdAt: new Date().toISOString() },
    ...currentTodos,
  ]);
  setDraft("");
}
```

**Expected flag:** No error handling on the fetch; todo added to local state even if the API call fails; no loading/disabled state so the user can double-submit.

---

### 10. Accessibility regression: removing aria attributes

**Category:** Accessibility | **Severity:** Medium | **Tests:** WCAG / a11y regression detection

Diff change — remove `aria-label`, `aria-pressed`, `aria-live`, `role` attributes from the JSX:

```jsx
<button
  className="checkbox"
  type="button"
  onClick={() => toggleTodo(todo.id)}
/>
// (no aria-label, no aria-pressed)
```

**Expected flag:** Buttons with no visible text and no `aria-label` are invisible to screen readers. Removing `aria-live` from the task count breaks announcements for assistive tech users.

---

## Summary

| # | Category | Severity | What it tests |
|---|----------|----------|---------------|
| 1 | Security (ReDoS) | High | Input sanitization awareness |
| 2 | Logic bug | High | React state update patterns |
| 3 | Security (XSS) | Critical | Dangerous API misuse |
| 4 | Style / correctness | Low | Nuance around `==` vs `===` |
| 5 | React correctness | Medium | Key prop uniqueness |
| 6 | Security (secrets) | Critical | Secret detection |
| 7 | Performance | Medium | Memoization awareness |
| 8 | Data safety | High | Destructive error handling |
| 9 | Async correctness | Medium | Error handling + race conditions |
| 10 | Accessibility | Medium | WCAG / a11y regression detection |

## Key observations

- Cases 1, 2, 4 are **pre-existing issues** not in the diff — they test the "surrounding code risks" review criteria added to the prompt. The model should flag them when changed code interacts with them.
- Cases 3, 5, 6, 7, 8, 9, 10 are **diff changes** — standard review territory.
- Case 4 tests **nuance** — the model should ideally recognize `== null` as an intentional JS idiom rather than blindly flagging it.
