# Rack Slicer - Enterprise PDU Configurator Specification

## Purpose

Develop a next-generation **Enterprise PDU Configurator** for Rack Slicer.

This is **not a static image library**. It is a **parametric component generation engine** capable of creating photorealistic enterprise PDUs based entirely on user-selected specifications.

Whenever the user changes any option, the application must instantly regenerate:

- SVG
- High-resolution preview
- JSON component definition
- Bill of Materials (BOM)
- Electrical specifications
- Physical dimensions
- Rack metadata

---

# Manufacturer Styles

Support industrial design themes inspired by:

- APC
- Schneider Electric
- Vertiv
- Eaton
- Raritan
- Server Technology
- Geist
- Cisco
- Dell
- HPE
- Generic Enterprise

Manufacturer selection changes appearance only, not electrical capabilities.

---

# Physical Configuration

## Orientation
- Horizontal
- Vertical
- Zero-U
- Dual Vertical
- Half Height
- Quarter Height
- Custom

## Rack Size
- 1U–6U
- Zero-U
- Custom

## Mounting
- Front
- Rear
- Side
- Tool-less
- Cage Nut
- Universal Rail

## Material
- Powder Coated Steel
- Aluminium
- Stainless Steel

## Colour
- Black
- Dark Grey
- White
- Silver
- Custom RAL

---

# Electrical Configuration

## Phase
- Single Phase
- Split Phase
- Three Phase Delta
- Three Phase Wye
- DC

## Voltage
100V, 110V, 120V, 200V, 208V, 220V, 230V, 240V, 380V, 400V, 415V, Custom

## Frequency
- 50 Hz
- 60 Hz

## Current Rating
10A, 13A, 15A, 16A, 20A, 30A, 32A, 40A, 63A, 100A

Automatically calculate total power capacity.

---

# Input Power

## Input Connector

IEC60309, IEC60320, NEMA, Twist Lock, Hard Wired, Terminal Block, UK, Schuko, India, Australia, China, South Africa, Custom

## Cord Length

None, 1m, 2m, 3m, 5m, 10m, Custom

## Cable Exit

Top, Bottom, Left, Right

---

# Outlet Configuration

Support:

- IEC C13
- IEC C15
- IEC C19
- IEC C21
- IEC C23
- Universal
- China
- UK
- USA
- Germany
- France
- Italy
- Australia
- India
- South Africa
- Mixed Configurations

Options:

- Outlet Count (1-96+)
- Mixed Outlet Types
- Rotation
- Locking
- Colour
- Bank Assignment
- Automatic Numbering

---

# Protection

- Thermal Breaker
- Hydraulic Breaker
- Electronic Breaker
- Per Bank Protection
- Per Outlet Protection
- Surge Protection
- EMI Filter
- Fuse
- RCD
- ELCB
- GFCI

---

# Intelligent Features

## PDU Types

- Basic
- Metered
- Metered by Bank
- Metered by Outlet
- Switched
- Managed
- Intelligent
- ATS
- Environmental
- High Density
- AI Ready

## Displays

- LCD
- OLED
- Touch
- Colour LCD
- E-Ink

## Sensors

Temperature, Humidity, Airflow, Leak Detection, Smoke, Door Contact, Water, Vibration

---

# Networking

Interfaces:

RJ45, SFP, SFP+, USB, USB-C, Serial, Console

Protocols:

SNMP, SNMPv3, HTTPS, SSH, REST API, Redfish, Modbus TCP, BACnet, MQTT, Syslog, LDAP, RADIUS, TACACS+, Active Directory, Microsoft Entra ID

Wireless:

Bluetooth, Wi-Fi, LTE, 5G

---

# Indicators

Power LED, Network LED, Alarm LED, Load LED, Outlet LEDs, RGB Status LEDs, Audible Alarm

---

# Live Generation Rules

Every user change must automatically:

- Validate compatibility
- Resize chassis
- Recalculate outlet spacing
- Position breakers
- Update labels
- Update displays
- Regenerate SVG
- Update preview
- Update metadata
- Generate BOM
- Update electrical calculations
- Update rack power summary

No page refresh should be required.

---

# Validation Rules

Prevent impossible combinations.

Examples:

- Incompatible voltage/input connector
- Too many outlets for enclosure
- Invalid breaker arrangement
- Unsupported phase/outlet combination

---

# Generated Deliverables

- SVG
- PNG Preview
- JSON
- Metadata
- BOM
- Rack Slicer Component
- Electrical Summary
- Physical Dimensions

---

# Extensibility

Use a plugin-based architecture. New manufacturers, outlet types, intelligent features and standards must be added without changing the core configurator.

The same engine will later power configurable Switches, Patch Panels, Servers, UPS systems and other Rack Slicer components.
