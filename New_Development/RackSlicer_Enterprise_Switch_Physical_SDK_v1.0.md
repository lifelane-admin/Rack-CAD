# RackSlicer Enterprise Switch Physical SDK v1.0

## Scope

Physical appearance only. No VLANs, STP, Routing, QoS or management
configuration.

## Design Principles

-   Parametric switch builder
-   Incremental upgrades
-   Shared component library
-   CAD-like layout constraints

## Workflow

1.  Vendor
2.  Chassis
3.  Base Switch
4.  Port Groups
5.  Uplinks
6.  Expansion
7.  Rear Panel
8.  Branding
9.  Appearance

## UI Controls

### Dropdown

Vendor, Chassis, Material, Finish, PSU, Cooling

### Numeric

RJ45, SFP, SFP+, QSFP, Expansion Slots, PSU Count

### Toggle

Management Port Console USB LCD PoE Stack Ports Rack Ears Asset Label
Dust Covers

### Color Picker

Panel Labels Brand LED Theme Accent

## Base Model

8 RJ45 + Power LED + System LED

## Upgrade Path

8→16→24→48 Ports PoE SFP SFP+ QSFP Management Stack Ports Dual PSU LCD
Enterprise

## Port Group Engine

Each group defines: - Name - Interface Type - Count - Numbering -
Position

Examples: LAN RJ45 1-48 Uplink SFP+ 49-52 QSFP28 53-54 MGMT Console

## Supported Hardware

RJ45 PoE SFP SFP+ SFP28 QSFP+ QSFP28 QSFP56 QSFP-DD USB Console MGMT LCD
Reset UID Stack Ports Expansion Modules Fan Modules Dual PSU Hot Swap
PSU

## Vendor Layouts

Cisco Catalyst Cisco Nexus Aruba CX Juniper EX Dell PowerSwitch
FortiSwitch Huawei Extreme MikroTik Ubiquiti Netgear Custom

## Rebranding

Logo, Model, Fonts, Colors, Materials, Brand Profiles.

## Constraints

No overlap Grid layout Automatic spacing Capacity calculation Panel full
=\> Larger switch or remove module Never resize ports

## Excluded

VLAN, STP, RSTP, MSTP, LACP, VXLAN, EVPN, Routing, ACL, QoS, SNMP,
Syslog, NetFlow, Authentication, Licensing.
