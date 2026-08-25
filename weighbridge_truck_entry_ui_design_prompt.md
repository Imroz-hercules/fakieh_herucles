# Weighbridge Truck Entry Page — UI Design Reference Prompt

## Purpose

Design a **production-grade industrial weighbridge Truck Entry page** for the Hercules-Fakieh weighing system.

Use the attached reference image as the visual direction, but improve the layout, spacing, hierarchy, readability, and interaction design.

**Important scope restriction:**
- Design only the **inside/page content**.
- Do **NOT** design or include the application sidebar.
- Do **NOT** design or include the global top navigation/topbar.
- The page should assume that the sidebar and topbar already exist in the application.
- The result must feel like a real industrial weighbridge operator interface, not a generic admin dashboard.

---

# 1. Overall Visual Direction

Use a **dark industrial / futuristic UI**.

The visual language should combine:

- Industrial control-room software
- Modern SaaS dashboard
- Digital weighbridge system
- High-contrast operator interface
- Subtle futuristic/neon technology aesthetic
- Clean enterprise UX

The interface should be dark, but **not excessively glowing**.

Avoid:
- Excessive neon
- Overly bright gradients
- Gaming-style UI
- Excessive glassmorphism
- Large decorative elements that reduce usability
- Excessive rounded cards
- Too many colors

The page should look professional enough for a real factory/warehouse environment.

---

# 2. Color System

## Primary Background

Use a very dark navy/blue-black background.

Suggested:

```text
Page background:       #020B14
Secondary background:  #061522
Panel background:      #071A29
Panel elevated:        #0A2030
Input background:      #071724
```

The background should have a subtle blue/cyan atmosphere, but remain dark.

---

## Primary Accent

Use **cyan / electric cyan** as the main brand and interaction color.

Suggested:

```text
Primary cyan:          #00D9FF
Bright cyan:           #5CEBFF
Dark cyan:             #008EA8
Cyan border:           #0A7187
Cyan glow:             rgba(0, 217, 255, 0.20)
```

Use cyan for:

- Active controls
- Selected states
- Important numbers
- Primary buttons
- Scale indicators
- Truck preview highlights
- Focus borders
- Important links
- Status indicators
- Small decorative lines

Do not make every element cyan.

---

## Status Colors

Green:

```text
#19D37E
```

Use for:

- ONLINE
- STABLE
- COMPLETED
- READY
- Connected

Amber:

```text
#FFB020
```

Use for:

- PENDING
- WAITING
- WARNING
- AWAITING WEIGHT

Red:

```text
#FF4D5E
```

Use only for:

- Errors
- Faults
- Emergency conditions
- Failed operations

---

## Typography Colors

```text
Primary text:       #EAF7FF
Secondary text:     #8AA6B8
Muted text:         #557181
Disabled text:      #3D5665
```

Headings should be bright and readable.

Labels should use muted cyan/blue-gray.

Important values should have strong contrast.

---

# 3. Page Structure

The page should have the following vertical structure:

```text
PAGE CONTENT
│
├── KPI / STATUS SUMMARY
│
├── NEW ENTRY
│
├── MAIN WEIGHING WORKSPACE
│   ├── Truck Preview
│   └── Live Weight + Entry Details
│
└── RECENT TRUCK ENTRIES
```

The content should fit naturally into a desktop widescreen layout.

Target viewport:

```text
1440 × 900
```

Also make the design responsive for:

```text
1280 × 800
1920 × 1080
```

---

# 4. KPI / Status Summary

At the top of the page content, create four compact KPI cards.

Do not make these cards excessively tall.

Use approximately:

```text
4 equal columns
Gap: 12–16px
Height: 65–75px
```

Cards:

### Card 1 — OUT PENDING

Icon:
- Small truck icon

Text:

```text
OUT PENDING
2
TRUCKS
```

Color:
- Cyan

---

### Card 2 — AWAITING WEIGHT

Icon:
- Hourglass / waiting icon

Text:

```text
AWAITING WEIGHT
1
TRUCK
```

Color:
- Amber

---

### Card 3 — ON SCALE

Icon:
- Weighbridge / scale icon

Text:

```text
ON SCALE
1
TRUCK
```

Color:
- Cyan

---

### Card 4 — TODAY ENTRIES

Icon:
- Bar chart / entries icon

Text:

```text
TODAY ENTRIES
24
TOTAL
```

Color:
- Cyan/blue

---

## KPI Card Design

Use:

```text
Background: #061522
Border: 1px solid #103143
Border radius: 8–10px
```

Icon should sit inside a small dark square.

Use a very subtle cyan radial glow behind active icons.

Avoid huge numbers.

The number should be approximately:

```text
20–24px
```

---

# 5. New Entry Section

Below the KPI row, create a large horizontal panel.

Header:

```text
NEW ENTRY
Select truck and material to start weighing
```

Use a subtle cyan accent line or tiny cyan indicator near the title.

---

## New Entry Controls

Create three horizontal areas:

```text
SELECT TRUCK
SELECT MATERIAL
CREATE ENTRY & GO TO SCALE
```

Approximately:

```text
Truck:       32%
Material:    32%
Button:      36%
```

---

# 6. Truck Dropdown

Label:

```text
SELECT TRUCK
```

Dropdown value example:

```text
WB20ST9012 - Scania R450
Reg. No: MH 20 AB 1234
```

Include:

- Small truck thumbnail/icon
- Truck number
- Truck model
- Registration number
- Dropdown arrow

The dropdown should have:

```text
Background: #071724
Border: #164153
Radius: 6–8px
```

On focus:

```text
Border: #00D9FF
Subtle cyan glow
```

---

# 7. Material Dropdown

Label:

```text
SELECT MATERIAL
```

Example:

```text
Aggregates - Type 1
Moisture: 2.1% | Bulk Density: 1,650 kg/m³
```

Include:

- Material icon
- Material name
- Secondary material information
- Dropdown arrow

The material dropdown should visually match the truck dropdown.

---

# 8. Create Entry Button

Large primary action:

```text
CREATE ENTRY & GO TO SCALE
→
```

Use cyan.

Suggested:

```text
Background: #00BFD9
Hover: #00D9FF
Text: #001018
```

Add a subtle cyan glow.

The button should be the strongest action in the New Entry section.

Do not make it look like a generic Bootstrap button.

---

# 9. Main Weighing Workspace

Below New Entry, create a two-column layout.

Recommended:

```text
Left: 65%
Right: 35%
```

Left:

```text
TRUCK PREVIEW
```

Right:

```text
LIVE WEIGHT READING
ENTRY DETAILS
```

The truck preview should visually dominate the page.

---

# 10. Truck Preview Panel

Header:

```text
TRUCK PREVIEW
```

Small subtitle:

```text
Live vehicle position
```

On the right side of the header show small chips:

```text
TRUCK  WB20ST9012
MATERIAL  Aggregates - Type 1
```

---

# 11. 3D Truck Visualization

This is one of the most important elements.

Show a **realistic 3D heavy dump truck** positioned on a weighbridge.

Preferred visual:

- Scania-style heavy dump truck
- Three-quarter front view
- Silver/white cab
- Dark charcoal dump body
- Multiple heavy-duty axles
- Realistic tires
- Detailed headlights
- Industrial metal textures

The truck should sit physically on the weighbridge platform.

---

## Weighbridge Visualization

The weighbridge should include:

- Steel platform
- Raised side beams
- Yellow/black hazard stripes
- Cyan LED accent underneath
- Entry ramp
- Industrial bolts/metal texture
- Scale indicator
- Traffic signal

The cyan light should be subtle.

Do not turn the entire platform into a glowing neon object.

---

# 12. Truck State Visualization

The truck visualization should communicate the current state.

For example:

```text
READY
ON SCALE
WEIGHING
WEIGHT STABLE
WAITING
COMPLETED
```

Use a small status badge.

Example:

```text
● WEIGHT STABLE
```

Green when stable.

If truck is moving:

```text
● MOTION DETECTED
```

Amber.

---

# 13. Scale Indicator

Inside the truck preview, place a small industrial digital scale indicator.

Example:

```text
0
kg
```

or:

```text
14,250
kg
```

The indicator should look like a real electronic weighbridge display.

Dark display:

```text
#020A12
```

Cyan digits:

```text
#5CEBFF
```

Use a subtle digital-display style.

---

# 14. Live Weight Reading Panel

The right side should contain a dedicated high-priority weight panel.

Header:

```text
LIVE WEIGHT READING
```

Top-right badge:

```text
kg
```

Main weight:

```text
14,250
```

Large cyan number.

Below or beside it show:

```text
GROSS      14,250 kg
TARE       --
NET        --
```

---

## Weight Number

The weight should be the most visually important number on the entire page.

Recommended:

```text
48–64px
Font weight: 500–600
Color: #5CEBFF
```

Use subtle cyan glow, but keep it readable.

Do not use excessive animation.

---

# 15. Stable State

When the scale is stable:

```text
● STABLE
```

Use green.

When unstable:

```text
● MOTION
```

Use amber.

The Capture button should only become active when the scale is stable and the business rules allow capture.

---

# 16. Entry Details Panel

Below the live weight panel, create:

```text
ENTRY DETAILS
```

Fields:

```text
DRIVER NAME / SCAN ID
```

Input example:

```text
Enter name or scan ID
```

Add optional scanner icon at the right.

---

## Selected Truck

Dropdown:

```text
SELECTED TRUCK

WB20ST9012 - Scania R450
```

---

## Selected Material

Dropdown:

```text
SELECTED MATERIAL

Aggregates - Type 1
```

These should match the selections from New Entry.

If the operator changes the selection here, keep the page state synchronized.

---

# 17. IN / OUT Selector

Create a segmented control:

```text
IN | OUT
```

Selected:

```text
IN
```

Selected state should use cyan.

Unselected state should remain dark.

Example:

```text
[ IN ] [ OUT ]
```

---

# 18. Action Buttons

Place two actions:

```text
SAVE ENTRY
CAPTURE WEIGHT
```

Primary:

```text
CAPTURE WEIGHT
```

Secondary:

```text
SAVE ENTRY
```

Capture Weight should use cyan.

Save Entry can use dark background with cyan border.

Disabled state should be obvious.

Example disabled:

```text
CAPTURE WEIGHT
```

when:

```text
Scale unstable
No truck selected
No material selected
Scale disconnected
```

---

# 19. Recent Truck Entries

At the bottom create a full-width table panel.

Header:

```text
RECENT TRUCK ENTRIES
```

Right side:

```text
VIEW ALL →
```

Show the latest 5–10 transactions.

---

# 20. Table Columns

Use:

```text
TIME
TRUCK NO
DRIVER
MATERIAL
TYPE
GROSS WEIGHT (KG)
TARE WEIGHT (KG)
NET WEIGHT (KG)
STATUS
ACTION
```

Example rows:

```text
02:37 PM | WB20ST9012 | Imran Khan | Aggregates - Type 1 | IN  | 14,250 | --    | --     | On Scale
02:15 PM | WB19KX442  | Ramesh Patil | Sand - Washed      | OUT | 22,480 | 8,120 | 14,360 | Completed
01:45 PM | TRK-882-B  | Suresh Yadav | Aggregates - Type 1 | OUT | 38,150 | 12,400 | 25,750 | Completed
12:30 PM | WB21XT3044 | Amit Sharma | Crushed Concrete | OUT | 14,800 | 5,200 | 9,600 | Completed
11:20 AM | WB21EF3456 | Vikram Singh | Aggregates - Type 2 | IN | 16,750 | -- | -- | Pending
```

---

# 21. Table Design

The table must remain readable in dark mode.

Header:

```text
Background: #061522
Text: #668899
```

Rows:

```text
Background: transparent
Border-bottom: #102B3A
```

Hover:

```text
Background: rgba(0, 217, 255, 0.04)
```

Important truck numbers:

```text
Color: #00D9FF
```

---

# 22. Status Badges

Use compact pill badges.

Completed:

```text
● Completed
```

Green.

On Scale:

```text
● On Scale
```

Cyan.

Pending:

```text
● Pending
```

Amber.

Error:

```text
● Error
```

Red.

Keep badges small and professional.

---

# 23. Action Menu

Last column should contain:

```text
•••
```

or a small eye/details icon.

Clicking it can open:

- View entry
- Edit entry
- Print ticket
- View weighing history
- Cancel entry, depending on permissions

---

# 24. Interaction Behavior

The page should behave like an actual weighing workflow.

## Step 1

Operator selects:

```text
Truck
Material
```

Truck preview updates immediately.

---

## Step 2

The 3D truck appears on the weighbridge.

Display:

```text
Truck number
Material
Scale number
Connection state
```

---

## Step 3

Operator clicks:

```text
CREATE ENTRY & GO TO SCALE
```

System changes state to:

```text
WAITING FOR TRUCK
```

---

## Step 4

Truck enters the weighbridge.

Display:

```text
MOTION DETECTED
```

Use amber.

---

## Step 5

Weight becomes stable.

Display:

```text
● STABLE
14,250 kg
```

Use green stable indicator.

---

## Step 6

Enable:

```text
CAPTURE WEIGHT
```

---

## Step 7

After capture:

- Save weight
- Update transaction status
- Add record to Recent Truck Entries
- Update KPI counters
- Update truck visualization state
- Show success feedback

---

# 25. Empty State

When no truck is selected, do not show an arbitrary truck.

Show a clean placeholder:

```text
SELECT A TRUCK TO BEGIN
```

with a subtle industrial weighbridge illustration.

---

# 26. Loading State

During scale communication:

```text
CONNECTING TO SCALE...
```

Use a small animated cyan indicator.

Do not block the entire page unnecessarily.

---

# 27. Error State

If scale connection fails:

```text
SCALE CONNECTION LOST
```

Show:

```text
Last reading: 14,250 kg
```

and:

```text
RECONNECT
```

button.

Never allow weight capture when communication is invalid.

---

# 28. Micro-interactions

Use subtle animations:

- Dropdown open
- Button hover
- Truck state transition
- Weight number update
- Stable indicator pulse
- Table row update
- Status changes
- Connection indicator

Animation duration:

```text
150–250ms
```

Avoid excessive animations.

---

# 29. Shadows and Borders

Use subtle borders rather than heavy shadows.

Suggested:

```text
Panel border:
rgba(50, 130, 155, 0.20)

Active border:
rgba(0, 217, 255, 0.65)

Subtle glow:
0 0 18px rgba(0, 217, 255, 0.10)
```

Do not use strong white shadows.

---

# 30. Border Radius

Keep the industrial UI slightly squared.

Recommended:

```text
Large panels: 8–10px
Inputs: 6–8px
Buttons: 6–8px
Badges: 999px
```

Avoid extremely rounded cards.

---

# 31. Spacing

Use a consistent spacing system.

```text
4px
8px
12px
16px
20px
24px
32px
```

Recommended:

```text
Page section gap: 14–18px
Card internal padding: 16px
Input gap: 12px
Table row height: 38–44px
```

---

# 32. Icon Style

Use clean outline icons.

Preferred style:

- Lucide
- Tabler
- Phosphor

Icons should be:

```text
16–20px
```

Avoid mixing multiple icon styles.

---

# 33. 3D Truck Requirements

The truck is a major visual component.

Use a high-quality realistic 3D/CGI truck.

Requirements:

- Heavy dump truck
- Three-quarter front view
- Truck centered on weighbridge
- Realistic wheels
- Realistic shadows
- Metallic materials
- Dark industrial dump body
- Silver/white cab
- Cyan environmental rim lighting
- Industrial scale platform
- Hazard stripes
- Traffic signal
- Digital weight display

The truck should not look cartoonish.

---

# 34. Important Layout Principle

The page should visually communicate:

```text
SELECT TRUCK
       ↓
SELECT MATERIAL
       ↓
TRUCK ARRIVES
       ↓
LIVE SCALE
       ↓
STABLE WEIGHT
       ↓
CAPTURE
       ↓
TRANSACTION LOG
```

The UI hierarchy should follow the real operator workflow.

---

# 35. Avoid These Problems

Do NOT create:

- Generic Bootstrap dashboard
- Excessive white space
- Excessive neon
- Gaming UI
- Overly futuristic sci-fi controls
- Huge KPI cards
- Giant decorative truck that hides information
- Tiny unreadable table
- Excessive gradients
- Excessive glassmorphism
- Random animations
- Too many accent colors
- Multiple competing primary buttons

The design must remain an **industrial operational interface first**.

---

# 36. Final Visual Target

The final page should feel similar to:

**Industrial Control System + Modern SaaS + Digital Weighbridge**

Visual keywords:

```text
Dark
Industrial
Cyan
Technical
Precise
Professional
Operational
High contrast
Minimal
Modern
Real-time
Data focused
```

The attached reference image is the primary visual reference for:

- Color direction
- Truck visualization
- Panel arrangement
- Weight display
- Table layout
- Cyan accent treatment
- Overall density

But refine it to be more polished, consistent, and production-ready.

**Do not copy the screenshot pixel-for-pixel. Use it as a design reference and improve the UX.**

---

# 37. Implementation Notes for AI UI Generator

If generating this as a web UI, prioritize:

1. Desktop-first responsive layout
2. Dark navy background
3. Cyan accent system
4. Realistic 3D truck visual
5. Live weight display as the strongest visual element
6. Clear operator workflow
7. Compact but readable data table
8. Strong stable/unstable scale states
9. Production-quality spacing
10. Accessibility and readable contrast

The final result should look like a real **Hercules-Fakieh industrial weighbridge operator console**, not a concept-art dashboard.
