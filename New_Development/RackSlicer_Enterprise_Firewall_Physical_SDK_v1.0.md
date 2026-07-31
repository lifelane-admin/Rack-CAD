# RackSlicer Enterprise Firewall Physical SDK v1.0

## Scope

This SDK defines ONLY the physical appearance of enterprise firewalls.
No logical configuration (Routing, VPN, Authentication, Policies,
Licensing, etc.) is included.

## Design Principles

-   Parametric hardware model
-   Incremental hardware upgrades
-   No overlapping components
-   Constraint-based layout
-   Reuse Switch port engine
-   Studio-grade photorealistic rendering

## Configuration Workflow

1.  Vendor Layout Profile
2.  Chassis (Desktop/1U/2U/4U)
3.  Base Model
4.  Port Groups
5.  Expansion Modules
6.  Rear Hardware
7.  Branding
8.  Appearance
9.  Render

## UI Controls

### Dropdown

-   Vendor Profile
-   Chassis Size
-   Material
-   Surface Finish
-   Console Type
-   LCD Type
-   PSU Type
-   Fan Type
-   Mounting Style

### Numeric

-   RJ45 Count
-   SFP Count
-   SFP+ Count
-   SFP28 Count
-   QSFP+/QSFP28 Count
-   Expansion Slots

### Toggle

-   MGMT Port
-   HA Ports
-   USB
-   Console
-   LCD
-   Rack Ears
-   QR Code
-   Asset Label
-   Dust Covers
-   Wireless Antennas

### Color Picker

-   Panel
-   Branding Strip
-   Labels
-   LEDs
-   Rack Ears
-   Accent

## Port Group Engine

Each group contains: - Group Name - Interface Type - Port Count -
Numbering Profile - Position - Alignment - LED Style

Examples: - LAN RJ45 (1-24) - X SFP+ (X1-X8) - MGMT RJ45 - HA RJ45 -
Console USB-C

## Supported Physical Ports

RJ45, PoE RJ45, MGMT RJ45, HA RJ45, Console RJ45, USB Console, USB-C
Console, DB9, Micro USB, SFP, SFP+, SFP28, QSFP+, QSFP28, QSFP56,
QSFP-DD

## Physical Components

-   Logo
-   Product Name
-   Model
-   LCD/OLED
-   LEDs
-   Reset Button
-   UID Button
-   Ventilation
-   PSU
-   Fan Modules
-   Storage Bays
-   Expansion Slots
-   Rack Ears
-   Asset Sticker
-   QR Code

## Port States

Connected, Disconnected, Link LED, Activity LED, Disabled, Fault, Hover,
Selected

## Rear Panel

-   PSU
-   Fans
-   Expansion
-   USB
-   Ground Lug
-   Airflow

## Vendor Profiles

Fortinet, Cisco, Palo Alto, Juniper, Sophos, Check Point, SonicWall,
Aruba, Dell, Huawei, Custom.

## Rebranding

Upload Logo, Product Name, Model, Fonts, Colors, Material, Finish, Brand
Profiles.

## Constraint Rules

-   No overlap
-   Fixed spacing
-   Grid alignment
-   Capacity calculation
-   Panel full =\> suggest larger chassis or remove module
-   Never shrink ports

## Excluded

Authentication, Routing, VPN, NAT, Policies, SD-WAN, Monitoring,
Licensing, HA Modes.
