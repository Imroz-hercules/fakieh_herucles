# Fakieh Order System — Operator Guide

**Audience:** Plant operators  
**Purpose:** Explain how orders work end-to-end, with clear diagrams for training  
**Screens used:** Live Orders · Order History · Truck Entry · Weighbridge  

---

## 1. What this system does (in plain language)

This is a **plant material-handling order system**, not a shop or invoice system.

Operators create orders for:

| Order family | What it does | Physical lines |
|--------------|--------------|----------------|
| **Intake** | Receive raw material into silos | Intake Line 1, Intake Line 2 |
| **Mineral** | Receive mineral material into mineral silos | Mineral Line 3 |
| **Outloading** | Send material out (Bulk or Packing) | Outloading 1, 2, 3 |
| **Bulk** | Move material between silos on the bulk line | Bulk line |
| **PIT** | Pit intake into destination silos | PIT line |
| **Truck weigh** | Capture entry/exit truck weights | Weighbridge (separate from PLC queue) |

**Important rule:** The PLC can run **only one order per physical line at a time**. Extra orders wait in a **queue** until the line is free and (for RFID lines) the correct badge is scanned.

### Live Orders status bar (operators)

| Indicator / control | Meaning |
|---------------------|---------|
| **PLC orders: Running** | Backend live PLC stream is on (always started with the server — operators cannot stop it) |
| **Live PLC Data (5s updates)** | This page also refreshes order/queue data every 5 seconds |
| **Refresh** | Manual reload of the live table now |

There is **no Start/Stop Broadcast button**. The live feed stays running continuously after backend startup.

---

## 2. Big picture — how everything connects

```mermaid
flowchart TB
  subgraph UI["Operator screens"]
    LO["Live Orders<br/>/fakieh/live_orders"]
    OH["Order History<br/>/fakieh/order-history"]
    TE["Truck Entry<br/>/fakieh/truck-entry"]
    WB["Weighbridge log<br/>/fakieh/weighbridge"]
  end

  subgraph Backend["Hercules backend"]
    Q["order_queue<br/>(WAITING → … → COMPLETED)"]
    DISP["Queue dispatcher<br/>(auto + manual Start)"]
    PLCW["PLC write tags<br/>DB1 / DB2 / DB3 / DB4"]
    LIFE["Status monitor<br/>handle_order_status"]
    HIST["History tables<br/>intake / outloading / bulk / pit"]
    TW["truck_weigh_orders"]
  end

  subgraph Plant["Plant floor"]
    RFID["RFID badge scan"]
    SIEMENS["Siemens PLC"]
    SCALE["Baykon scales"]
  end

  LO -->|Add Order = enqueue| Q
  Q --> DISP
  DISP -->|Idle + RFID match| PLCW
  PLCW --> SIEMENS
  RFID --> SIEMENS
  SIEMENS -->|status words| LIFE
  LIFE -->|order finished| HIST
  LIFE -->|queue COMPLETED + RFID free| Q
  OH --> HIST
  TE --> TW
  SCALE --> TE
  TW --> WB
```

---

## 3. Where to work in the UI

```mermaid
flowchart LR
  A["Fakieh menu"] --> B["Live Orders"]
  A --> C["Order History"]
  A --> D["Truck Entry"]
  A --> E["Weighbridge"]

  B --> B1["Create / queue orders"]
  B --> B2["Watch live PLC status"]
  B --> B3["Start / Cancel waiting orders"]

  C --> C1["Past completed orders"]

  D --> D1["New truck trip"]
  D --> D2["First & second weight"]

  E --> E1["Completed weigh tickets"]
```

| Screen | When to use it |
|--------|----------------|
| **Live Orders** | Create plant orders, see waiting queue, see what the PLC is doing now. Live PLC stream is always on (status only; no Start/Stop). |
| **Order History** | Look up finished plant orders later |
| **Truck Entry** | Start a weighbridge trip and save entry/exit weights |
| **Weighbridge** | Review completed truck weigh tickets |

---

## 4. Order types and lines (plant map)

```mermaid
flowchart TB
  subgraph Intake["Intake — DB1"]
    I1["Line 1"]
    I2["Line 2"]
  end

  subgraph Mineral["Mineral — DB3"]
    M3["Line 3<br/>dest silos 401–408"]
  end

  subgraph Outloading["Outloading — DB2"]
    O1["Line 1"]
    O2["Line 2"]
    O3["Line 3"]
  end

  subgraph DB4["Bulk / PIT — DB4"]
    BL["Bulk line<br/>(FIFO, no RFID)"]
    PT["PIT line<br/>(FIFO, no RFID)"]
  end
```

| Tab on Live Orders | Queue type | PLC DB | RFID required? |
|--------------------|------------|--------|----------------|
| Intake Line 1 | `intake` | DB1 line 1 | Yes |
| Intake Line 2 | `intake` | DB1 line 2 | Yes |
| Mineral Intake | `mineral` | DB3 line 3 | Yes |
| Outloading 1 / 2 / 3 | `outloading` | DB2 line 1/2/3 | Yes |
| Bulk Line | `bulk` | DB4 | No (FIFO) |
| PIT Line | `pit` | DB4 | No (FIFO) |

---

## 5. How to create a plant order (step by step)

### 5.1 Operator steps on Live Orders

```mermaid
flowchart TD
  A["1. Open Live Orders"] --> B["2. Select the correct tab<br/>(Intake / Mineral / Outloading / Bulk / PIT)"]
  B --> C["3. Click Add Order"]
  C --> D["4. Fill the form<br/>(Truck + Client are required)"]
  D --> E{"Validation OK?"}
  E -->|No| F["Fix errors shown in toast"]
  F --> D
  E -->|Yes| G["5. Submit"]
  G --> H["Order saved as WAITING<br/>RFID locked if used"]
  H --> I["Appears in Waiting Orders list"]
  I --> J["System waits for Idle + RFID match<br/>(or operator clicks Start)"]
```

### 5.2 What you fill in (by order type)

#### Intake / Mineral / Outloading

| Field | Required | Notes |
|-------|----------|-------|
| **Truck** | Yes | Must select a truck |
| **Client Name** | Yes | Must select a client |
| **Badge / RFID** | Yes (intake / mineral / outloading) | Badge used to match when truck is scanned |
| **Source material** | Yes | Material code + name |
| **Declared quantity (kg)** | Yes | Planned weight |
| **Destination Silo 1 / 2** | At least one | Destination bins |
| **Destination (Bulk / Packing)** | Outloading only | **0 = Bulk**, **1 = Packing** |

#### Bulk

| Field | Notes |
|-------|-------|
| Truck, Client | Required |
| Source silo | Required before dest silos show |
| Dest silo 1 / 2 | Destination routing |
| Declared qty (kg) | Planned weight |
| CC25 select, Scale select | Line options |

#### PIT

| Field | Notes |
|-------|-------|
| Truck, Client | Required |
| Pit number | Which pit |
| Raw material code | Required before dest silos show |
| Dest silo 1 / 2 | Destinations |
| Declared qty (kg), Scale select | Weight / scale options |

### 5.3 What happens after you click Submit

```mermaid
sequenceDiagram
  actor Op as Operator
  participant UI as Live Orders UI
  participant API as Backend /orders/enqueue
  participant Q as order_queue table
  participant RFID as RFID lock

  Op->>UI: Fill form + Submit
  UI->>API: POST enqueue
  API->>RFID: Lock badge (rfid_used = true)
  API->>Q: INSERT row status = WAITING
  API-->>UI: OK + queue position
  UI-->>Op: Toast: Order Queued

  Note over Op,Q: Order is NOT written to PLC yet
```

**Key point for operators:**  
**Add Order = put in waiting list.**  
It does **not** start the machine immediately. The PLC starts only when:

1. That line is **Idle**, and  
2. For RFID lines: the **scanned RFID matches** the order’s badge, **or**  
3. You press **Start** on that waiting order (manual).

---

## 6. Queue lifecycle (WAITING → COMPLETED)

### 6.1 Status meanings (operator view)

| Queue status | Meaning | What operator sees / does |
|--------------|---------|---------------------------|
| **WAITING** | In queue, not on PLC yet | Can **Start** or **Cancel** |
| **DISPATCHED** | Written to PLC, waiting process start | Can **Cancel** (clears tags); RFID still locked |
| **RUNNING** | PLC is processing (status Starting/Running/…) | Wait for plant to finish |
| **COMPLETED** | Finished; saved to history; RFID released | Appears in Order History |
| **CANCELLED** | Stopped by operator; RFID released | Removed from active work |

```mermaid
stateDiagram-v2
  [*] --> WAITING: Add Order

  WAITING --> DISPATCHED: Auto dispatch\n(Idle + RFID match)\nor Manual Start
  DISPATCHED --> RUNNING: PLC status 2–7 / 8 / 12
  RUNNING --> COMPLETED: PLC returns Idle\nafter finish

  WAITING --> CANCELLED: Cancel
  DISPATCHED --> CANCELLED: Cancel

  COMPLETED --> [*]
  CANCELLED --> [*]
```

### 6.2 Auto dispatch (normal plant flow)

```mermaid
flowchart TD
  A["Line is Idle (PLC status = 1)"] --> B{"Order type?"}
  B -->|Intake / Mineral / Outloading| C["Read scanned RFID on line"]
  C --> D{"WAITING order with\nsame RFID?"}
  D -->|Yes| E["Write order tags to PLC"]
  D -->|No| F["Stay Idle — do not start random order"]
  B -->|Bulk / PIT| G["Take next WAITING order FIFO"]
  G --> E
  E --> H["Queue status = DISPATCHED"]
  H --> I["PLC starts → RUNNING"]
  I --> J["PLC completes → Idle"]
  J --> K["Queue = COMPLETED<br/>RFID unlocked<br/>Row saved to history"]
```

### 6.3 Manual Start / Cancel

On the **Waiting Orders** list:

- **Start** — force dispatch of that waiting order (when allowed; line should be Idle).
- **Cancel** — remove WAITING or DISPATCHED order; unlock RFID; if already dispatched, clear PLC tags.

```mermaid
flowchart LR
  W["WAITING"] -->|Start| D["DISPATCHED → PLC"]
  W -->|Cancel| X["CANCELLED + RFID free"]
  D -->|Cancel| X
```

---

## 7. PLC status words (what the live table shows)

While an order is on the line, the Live Orders table shows the **PLC status**, not only the queue status.

| Code | Label | Kind | Typical meaning |
|-----:|-------|------|-----------------|
| 0 | No Status | Inactive | Nothing meaningful yet |
| 1 | Idle | Idle | Line free — ready for next order |
| 2 | Starting | Active | Process starting |
| 6 | Running | Active | Process running |
| 8 | Stopping | Warn | Process stopping / finishing |
| 12 | Completed | Success | Cycle completed |

```mermaid
flowchart LR
  I["1 Idle"] --> S["2 Starting"]
  S --> R["6 Running"]
  R --> T["8 Stopping / 12 Completed"]
  T --> I2["1 Idle again"]
  I2 --> SAVE["System saves completed order\nto history database"]
```

**When is the order saved permanently?**  
Only after the PLC finishes and returns to **Idle**. Then Hercules writes a completed row into history (`intake_orders`, `outloading_orders`, `bulk_line_orders`, or `pt_line_orders`).

---

## 8. Full create → finish journey (one diagram)

Use this when explaining a full truck/intake or outloading cycle to a new operator:

```mermaid
sequenceDiagram
  actor Op as Operator
  participant UI as Live Orders
  participant Q as Queue
  participant Disp as Dispatcher
  participant PLC as Siemens PLC
  participant Hist as Order History DB

  Op->>UI: Add Order (truck, client, RFID, material, qty, silos)
  UI->>Q: WAITING + lock RFID
  Note over Op: Truck arrives / badge scanned on line

  PLC-->>Disp: Line Idle + RFID reading
  Disp->>Q: Match WAITING by RFID
  Disp->>PLC: Write order tags
  Q->>Q: DISPATCHED → RUNNING

  Note over PLC: Plant runs material handling

  PLC-->>Disp: Status Stopping/Completed then Idle
  Disp->>Hist: INSERT completed order
  Disp->>Q: COMPLETED + unlock RFID
  Op->>UI: See live clear / check Order History later
```

---

## 9. Special rules operators must know

### 9.1 One active order per line

```mermaid
flowchart TB
  L1["Intake Line 1"] --> A1["At most 1 DISPATCHED or RUNNING"]
  L1 --> W1["Many WAITING OK"]

  L2["Outloading Line 2"] --> A2["At most 1 active"]
  L2 --> W2["Many WAITING OK"]
```

You may queue many orders. Only one runs on that line.

### 9.2 RFID lock

- When an order is WAITING / DISPATCHED / RUNNING, its **RFID cannot be used on another order**.
- When the order completes or is cancelled, the RFID is **released**.

### 9.3 Mineral destinations

- Mineral orders must use destination silos **401–408**.
- Wrong range → form rejects with a clear message.

### 9.4 Outloading destination selection

| UI choice | Value | Meaning |
|-----------|------:|---------|
| Bulk | 0 | Route to bulk |
| Packing | 1 | Route to packing |

### 9.5 Outloading silo picker rules

```mermaid
flowchart TD
  A["Operator opens Dest Silo dropdown"] --> B["Show only high silos 801–824"]
  B --> C{"Paired low silo N+24<br/>has low-level active?"}
  C -->|Yes| D["Hide high silo N"]
  C -->|No| E["Show high silo N"]
  F["Never show 825–848 as destinations"]
```

Example pairing: **801 ↔ 825**, **802 ↔ 826**, … (offset +24).

### 9.6 Silo HL / LOCK

If a destination is blocked by high-level or lock sensors, create/write can be rejected. Fix silo condition or choose another destination.

### 9.7 Truck + Client always required

Live Orders will not accept an order without both **Truck** and **Client**.

---

## 10. How to create an outloading order (example walkthrough)

```mermaid
flowchart TD
  A["Open Live Orders"] --> B["Tab: Outloading 1 (or 2 / 3)"]
  B --> C["Add Order"]
  C --> D["Select Truck"]
  D --> E["Select Client"]
  E --> F["Enter Badge / RFID"]
  F --> G["Select material"]
  G --> H["Enter declared kg"]
  H --> I["Choose Bulk or Packing"]
  I --> J["Choose Dest Silo 1 and/or 2<br/>(801–824, available only)"]
  J --> K["Submit → WAITING"]
  K --> L["When line Idle and RFID scanned<br/>→ order starts automatically"]
  L --> M["Watch live status: Starting → Running → Stopping"]
  M --> N["When Idle again → order in History"]
```

---

## 11. How to create an intake / mineral order (example)

```mermaid
flowchart TD
  A["Live Orders → Intake Line 1/2<br/>or Mineral Intake"] --> B["Add Order"]
  B --> C["Truck + Client + RFID"]
  C --> D["Material + qty kg"]
  D --> E["Destination silos"]
  E --> F{"Mineral tab?"}
  F -->|Yes| G["Dest must be 401–408"]
  F -->|No| H["Normal intake silos"]
  G --> I["Submit → WAITING"]
  H --> I
  I --> J["RFID scan on matching line when Idle"]
  J --> K["Runs → Completes → History"]
```

---

## 12. Bulk and PIT (no RFID match)

```mermaid
flowchart LR
  A["Add Bulk or PIT order"] --> B["WAITING"]
  B --> C["When line Idle"]
  C --> D["Next order in queue starts FIFO"]
  D --> E["RUNNING → COMPLETED"]
```

Unlike intake/outloading, Bulk and PIT do **not** wait for an RFID match. They start in queue order when the line is free (or when you press Start).

---

## 13. Truck weighbridge orders (separate system)

Plant PLC orders and weighbridge trips are **related in operations** (same truck/material idea) but stored separately.

### 13.1 Weigh trip lifecycle

```mermaid
stateDiagram-v2
  [*] --> awaiting_first: Create trip on Truck Entry
  awaiting_first --> awaiting_second: Save first weight
  awaiting_second --> completed: Save second weight
  awaiting_first --> cancelled: Delete / cancel
  awaiting_second --> cancelled: Delete / cancel
  completed --> [*]
  cancelled --> [*]
```

### 13.2 Operator steps

```mermaid
flowchart TD
  A["Open Truck Entry"] --> B["Select Truck + Material"]
  B --> C["Create order"]
  C --> D["Capture ENTRY weight → First"]
  D --> E["Truck does plant work"]
  E --> F["Capture EXIT weight → Second"]
  F --> G["Net kg = |second − first|"]
  G --> H["Status completed<br/>Visible on Weighbridge log"]
```

### 13.3 Rules

| Rule | Detail |
|------|--------|
| One open trip per truck | Cannot create a second open weigh order for the same truck |
| Net weight | Absolute difference of first and second weights |
| Cancel | Only open trips (`awaiting_first` / `awaiting_second`) |

```mermaid
sequenceDiagram
  actor Op as Operator
  participant TE as Truck Entry
  participant API as /api/truck-entry
  participant DB as truck_weigh_orders
  participant SC as Live scale

  Op->>TE: New trip (truck + material)
  TE->>API: POST /orders
  API->>DB: status = awaiting_first
  SC-->>TE: Live reading
  Op->>TE: Save first weight
  TE->>API: POST /orders/{id}/first
  API->>DB: awaiting_second
  Op->>TE: Save second weight
  TE->>API: POST /orders/{id}/second
  API->>DB: completed + net_kg
```

---

## 14. Order History

After a plant order completes:

1. Queue status becomes **COMPLETED**
2. A permanent row is stored in the matching history table
3. Operator can open **Order History** to filter/search past orders
4. History can be deleted from the history screen if needed (admin/operations practice)

```mermaid
flowchart LR
  A["PLC cycle finished"] --> B["History row created"]
  B --> C["Order History screen"]
  C --> D["Filter by type / date"]
```

---

## 15. Master data used by orders

Orders link to existing plant records:

```mermaid
erDiagram
  ORDER_QUEUE ||--o| TRUCK : truck_id
  ORDER_QUEUE ||--o| CLIENT : client_id
  ORDER_QUEUE ||--o| RFID : rfid_number
  INTAKE_ORDERS ||--o| TRUCK : truck_id
  INTAKE_ORDERS ||--o| CLIENT : client_id
  TRUCK_WEIGH_ORDERS ||--|| TRUCK : truck_id

  TRUCK {
    int id
    string license
  }
  CLIENT {
    int id
    string name
    string phone
  }
  RFID {
    string number
    bool used
  }
```

Before creating orders, ensure:

- Trucks exist in **Truck Management**
- Clients exist in **Client Information**
- RFID badges are configured and not already locked to another open order
- Materials / silos are available (not HL/LOCK blocked where applicable)

---

## 16. Troubleshooting for operators

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Order stays WAITING | Line busy, or RFID not scanned / mismatch | Wait for Idle; confirm correct badge on correct line; or use **Start** if allowed |
| “RFID already in use” | Badge locked to another open order | Finish or cancel the other order |
| Cannot select silo | HL/LOCK or outloading low-pair rule | Pick another silo; check silo status |
| Mineral create fails | Dest not in 401–408 | Fix destinations |
| Outloading create fails | Bulk/Packing not chosen | Set Destination to Bulk (0) or Packing (1) |
| Truck create fails on weigh | Truck already has open trip | Complete or cancel the open weigh order |
| History empty after run | Cycle did not return to Idle / not finished | Confirm PLC reached Stopping/Completed then Idle |

```mermaid
flowchart TD
  A["Order not starting?"] --> B{"Line Idle?"}
  B -->|No| C["Wait for current order to finish"]
  B -->|Yes| D{"RFID line?"}
  D -->|Yes| E{"Scanned RFID = order RFID?"}
  E -->|No| F["Scan correct badge or check badge on order"]
  E -->|Yes| G["Check dispatcher / try Manual Start"]
  D -->|No Bulk/PIT| H["Should FIFO start — check queue position / Start"]
```

---

## 17. Two systems side by side (training summary)

```mermaid
flowchart TB
  subgraph PlantOrders["Plant Live Orders"]
    P1["Enqueue WAITING"]
    P2["Dispatch to PLC"]
    P3["Run on line"]
    P4["Save to Order History"]
  end

  subgraph Weigh["Truck Entry / Weighbridge"]
    W1["Create trip"]
    W2["First weight"]
    W3["Second weight"]
    W4["Completed ticket"]
  end

  PlantOrders -.->|"Same truck may do both<br/>but separate records"| Weigh
```

| | Live plant order | Weighbridge trip |
|--|------------------|------------------|
| Screen | Live Orders | Truck Entry |
| Starts machine? | Yes (via PLC) | No — only records weights |
| Queue? | Yes | No (one open per truck) |
| RFID match? | Yes for intake/mineral/outloading | No |
| Final record | Order History | Weighbridge log |

---

## 18. Quick cheat sheet (print this page)

### Create plant order
1. Live Orders → correct tab  
2. **Add Order**  
3. Truck + Client + (RFID if needed) + material + qty + silos (+ Bulk/Packing for outloading)  
4. Submit → **WAITING**  
5. When Idle + RFID match → runs automatically  
6. Finished → **Order History**

### Cancel plant order
- Waiting / Dispatched → **Cancel** on queue row → RFID freed  

### Create weigh trip
1. Truck Entry → truck + material → create  
2. Save first weight  
3. Save second weight → net calculated → Weighbridge log  

### Never forget
- One running order **per line**  
- Add Order ≠ start machine (it queues)  
- RFID locked until complete/cancel  
- Truck + Client required on Live Orders  

---

## 19. Visual: end-to-end operator day (example)

```mermaid
flowchart TD
  subgraph Morning["Morning"]
    M1["Prepare trucks & clients in master data"]
    M2["Queue several intake / outloading orders"]
  end

  subgraph Gate["Gate / Weighbridge"]
    G1["Truck Entry: create trip + first weight"]
  end

  subgraph Plant["Plant lines"]
    P1["Truck RFID scanned on Idle line"]
    P2["Matching WAITING order starts"]
    P3["Operator watches Live Orders status"]
    P4["Order completes → history saved"]
  end

  subgraph Exit["Exit"]
    X1["Truck Entry: second weight"]
    X2["Net kg on Weighbridge log"]
  end

  M1 --> M2 --> G1 --> P1 --> P2 --> P3 --> P4 --> X1 --> X2
```

---

## 20. Related technical docs (for supervisors / IT)

| Document | Content |
|----------|---------|
| `docs/LIVE_ORDER_WORKFLOW_PLAN.md` | Original queue design spec |
| `docs/OUTLOADING_ORDERS_UPDATE.md` | Bulk/Packing + silo rules |
| `docs/TRUCK_ENTRY_WEIGHBRIDGE_PLAN.md` | Weighbridge plan |
| `ORDER_COMPLETE_AND_PLC_MONITORING.md` | Completion + PLC monitoring |

---

*Document generated for operator training. Screenshots can be added next to each “Add Order” / “Waiting Orders” / “Truck Entry” section if needed for classroom printouts.*
