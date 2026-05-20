# Assignment Brief — DBTaskPlatform

> The verbatim-ish assignment from the .docx. **No interpretation, no derived rules** — for those see [requirements.md](requirements.md). Original Word document: [dotnet-angular-assignment.docx](../dotnet-angular-assignment.docx).

---

## 1. Assignment Summary

Build a **Full-Stack Extensible Task-Management Platform**.

The platform manages "tasks" that move through an ordered, integer-based status workflow. Two example task types are defined:

- **Procurement**
- **Development**

The platform must **cleanly separate general workflow rules (apply to every task type, now and forever) from task-specific rules (data + final status of a given type)**. The architecture must support **adding a new task type without modifying existing code** — this is the central design challenge and the primary grading axis.

Stack: **.NET Web API + EF Core + MSSQL** on the backend, **Angular (strict TS)** on the frontend.

---

## 2. Functional Requirements

### 2.1 Operations the system must support

| Operation | Description |
| --- | --- |
| **Create Task** | Accepts a task type + initial assigned user (from `Users` table). Task starts at status `1`. |
| **Change Status** | Forward or backward move, with validations. Records the **next assigned user** and any custom data required by the target status. |
| **Close Task** | Allowed **only** from the task type's final status. Once closed, the task is immutable. |
| **Get User Tasks** | Returns all tasks currently assigned to a given user. |

### 2.2 User management

- **No user management UI/endpoints required.**
- Users are **seeded** in the database via EF Core migration / seed script.
- A **hard-coded user ID** in the Angular client is acceptable.

---

## 3. Core Workflow Rules (apply to all task types, present and future)

1. A task is assigned to **exactly one user at any moment**.
2. A task is either **Open** or **Closed**. **Closed tasks are immutable.**
3. Status is tracked by **ascending integers**: `1, 2, 3, …`.
4. **Forward moves must be sequential** — no skipping (e.g., 1 → 3 is invalid; 1 → 2 is valid).
5. **Backward moves are always allowed** (any earlier status is reachable from any later status, while open).
6. A task may be **closed only at its final status** (the highest valid status for its type).
7. Every status change must:
   - (a) satisfy **type-specific data requirements** for the target status,
   - (b) record the **next assigned user**.

These rules are universal. They must live in a single place, not be duplicated per task type.

---

## 4. Task Type Catalog (current examples)

### 4.1 Procurement

| Status | Meaning | Required Data |
| --- | --- | --- |
| 1 | Created | — |
| 2 | Supplier offers received | **2 price-quote strings** |
| 3 | Purchase completed | **Receipt string** |
| Closed | — | Only from status 3 |

### 4.2 Development

| Status | Meaning | Required Data |
| --- | --- | --- |
| 1 | Created | — |
| 2 | Specification completed | **Specification text** |
| 3 | Development completed | **Branch name** |
| 4 | Distribution completed | **Version number** |
| Closed | — | Only from status 4 |

These are **examples**, not the universe. A third (and fourth, fifth…) task type must be addable **without editing existing files** beyond registration.

---

## 5. Technical Requirements

### 5.1 Server (.NET)

- **.NET Web API**
- **Entity Framework Core** with **MSSQL (SQL Server)**
- **C#**
- **Dependency Injection** via ASP.NET Core's built-in container
- **REST** endpoints
- **Custom-field storage design is an intentional, graded decision.** Trade-offs (table-per-type, single JSON column, EAV, owned entities, etc.) must be made deliberately and justified in the README.

### 5.2 Client (Angular)

- **Angular** (recent stable)
- **TypeScript strict mode** (`"strict": true` in `tsconfig`)
- Use **built-in Angular features**: DI, services, reactive patterns (RxJS / signals as appropriate)
- **Component architecture**: focused components, clean templates
- **Minimal UI** — functionality over styling
- Required client capabilities: **create task, advance / reverse / close lifecycle, view a user's tasks**
- **Hard-coded user ID is acceptable**

---

## 6. Out of Scope (do not build unless asked)

- User CRUD UI / endpoints.
- Authentication / authorization / sessions.
- Real-time updates (SignalR / WebSockets).
- Notifications / email.
- Production deployment, Kubernetes, etc. (docker-compose for local dev is fine and already present in the repo).
- Heavy UI polish, design system, theming, accessibility audit (basic accessibility is welcome but not a deliverable).
- Internationalization.
