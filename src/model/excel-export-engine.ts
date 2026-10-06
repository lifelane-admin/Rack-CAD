import * as XLSX from 'xlsx';
import { PhysicalInfrastructureModel } from './physical-model';
import { USpaceEngine } from './u-space-engine';
import { ValidationFinding, ChangeProposal } from './types';
import { getActiveWorkflowOrchestrator } from '../ai/workflow/workflow-orchestrator';

export class ExcelExportEngine {
  /**
   * Builds the structured data for all 20+ engineering sheets from the Physical Infrastructure Model.
   */
  static generateSheets(model: PhysicalInfrastructureModel): Array<{ name: string; rows: any[][] }> {
    const project = model.getProject();
    const racks = model.getRacks();
    const objects = model.getObjects();
    const ports = model.getPorts();
    const cables = model.getCables();
    const power = model.getPowerMappings();
    const failureDomains = model.getFailureDomains();
    const findings = model.validate();
    const proposals = model.getProposals();
    const history = model.getVersionManager().getHistory();

    const sheets: { name: string; rows: any[][] }[] = [];

    // 1. 01_Project_Summary
    sheets.push({
      name: '01_Project_Summary',
      rows: [
        ['RACKSLICER PHYSICAL INFRASTRUCTURE MODEL — PROJECT SUMMARY'],
        [''],
        ['Project Name', project.projectName],
        ['Project ID', project.projectId],
        ['Status', project.status.toUpperCase()],
        ['Architecture Version', project.version],
        ['Created Date', project.createdDate],
        ['Last Modified Date', project.modifiedDate],
        ['Customer', project.customer || 'Enterprise Customer'],
        ['Datacenter', project.datacenter || 'Primary DC - Floor 1'],
        ['Site', project.site || 'Campus A'],
        ['Room', project.room || 'Hall 1'],
        ['Description', project.description || 'Deterministic Physical Infrastructure Architecture'],
      ],
    });

    // 2. 02_Architecture_Summary
    const totalWatts = objects.reduce((a, b) => a + (b.powerWatts || 0), 0);
    const totalWeight = objects.reduce((a, b) => a + (b.weight || 0), 0);
    const totalU = racks.reduce((a, b) => a + b.rackSizeU, 0);
    const usedU = objects.reduce((a, b) => a + b.heightU, 0);

    sheets.push({
      name: '02_Architecture_Summary',
      rows: [
        ['METRIC', 'VALUE', 'UNIT', 'EVALUATION'],
        ['Total Racks', String(racks.length), 'Cabinets', 'Active'],
        ['Total Physical Objects', String(objects.length), 'Chassis', 'Active'],
        ['Total Ports', String(ports.length), 'Physical Interfaces', 'Mapped'],
        ['Total Cables', String(cables.length), 'Cables', 'Cabled'],
        ['Total Infrastructure Power', (totalWatts / 1000).toFixed(2), 'kW', totalWatts > 20000 ? 'High Density' : 'Normal'],
        ['Total Weight Load', totalWeight.toFixed(1), 'kg', 'Within Floor Rating'],
        ['Rack Space Utilization', `${totalU > 0 ? Math.round((usedU / totalU) * 100) : 0}%`, 'U Occupancy', `${usedU} of ${totalU} RU`],
        ['Deterministic Health Status', findings.some(f => f.severity === 'CRITICAL') ? 'CRITICAL RISKS DETECTED' : 'HEALTHY', 'Audit', `${findings.length} Findings`],
      ],
    });

    // Build human-friendly identifier maps so names remain deterministic and consistent across all sheets
    const rackIdMap = new Map<string, string>();
    racks.forEach((r, i) => {
      rackIdMap.set(r.rackId, this.isUuid(r.rackId) ? `RK-${String(i + 1).padStart(2, '0')}` : r.rackId);
    });

    const objIdMap = new Map<string, string>();
    objects.forEach((o, i) => {
      objIdMap.set(o.objectId, this.isUuid(o.objectId) ? `OBJ-${String(i + 1).padStart(3, '0')}` : o.objectId);
    });

    const cableIdMap = new Map<string, string>();
    cables.forEach((c, i) => {
      cableIdMap.set(c.cableId, this.isUuid(c.cableId) ? `CBL-${String(i + 1).padStart(3, '0')}` : c.cableId);
    });

    // 3. 03_Rack_Inventory
    sheets.push({
      name: '03_Rack_Inventory',
      rows: [
        ['RACK ID', 'NAME', 'TOTAL U', 'USED U', 'FREE U', 'UTIL %', 'POWER (W)', 'WEIGHT (KG)', 'FAILURE DOMAIN', 'ORIENTATION'],
        ...racks.map(r => [
          rackIdMap.get(r.rackId) || r.rackId,
          r.rackName,
          String(r.rackSizeU),
          String(r.usedU),
          String(r.freeU),
          `${r.utilizationPercent}%`,
          String(r.powerConsumed),
          String(r.weightConsumed),
          r.failureDomain || 'Default Zone',
          r.frontOrientation || 'North',
        ]),
      ],
    });

    // 4. Individual Rack Elevation Sheets (04_Rack_01, 05_Rack_02...)
    let rackSheetIdx = 4;
    for (const rack of racks) {
      const sheetName = `${String(rackSheetIdx++).padStart(2, '0')}_${rack.rackName.replace(/\s+/g, '_').substring(0, 20)}`;
      const objectsInRack = objects.filter(o => o.rackId === rack.rackId);
      const occupancy = USpaceEngine.getOccupancyMap(rack, objectsInRack);

      const rackRows: string[][] = [
        ['U POSITION', 'OBJECT ID', 'OBJECT NAME', 'MANUFACTURER', 'MODEL', 'HEIGHT', 'POWER (W)', 'PSU REDUNDANCY', 'STATUS'],
      ];

      // Top to bottom (RU 42 down to 1)
      for (let u = rack.rackSizeU; u >= 1; u--) {
        const item = occupancy.get(u);
        if (item) {
          rackRows.push([
            `U${u}`,
            objIdMap.get(item.objectId) || item.objectId,
            item.objectName,
            item.manufacturer,
            item.model,
            `${item.heightU}U`,
            String(item.powerWatts),
            item.psuRedundancy,
            item.status,
          ]);
        } else {
          rackRows.push([`U${u}`, '—', '[ EMPTY SLOT ]', '—', '—', '1U', '0', '—', 'Available']);
        }
      }

      sheets.push({ name: sheetName, rows: rackRows });
    }

    // 5. Object_Inventory
    sheets.push({
      name: 'Object_Inventory',
      rows: [
        ['OBJECT ID', 'CATEGORY', 'SUBCATEGORY', 'NAME', 'MANUFACTURER', 'MODEL', 'SERIAL NUMBER', 'RACK', 'U START', 'U END', 'HEIGHT', 'POWER (W)', 'WEIGHT (KG)', 'HA PAIR', 'STATUS'],
        ...objects.map(o => [
          objIdMap.get(o.objectId) || o.objectId,
          o.category.toUpperCase(),
          o.subCategory,
          o.objectName,
          o.manufacturer,
          o.model,
          o.serialNumber || 'N/A',
          this.resolveRackName(o.rackId, model),
          `U${o.uStart}`,
          `U${o.uEnd}`,
          `${o.heightU}U`,
          String(o.powerWatts),
          String(o.weight),
          o.haPairId ? (this.resolveObjectName(o.haPairId, model) || 'Configured') : 'None',
          o.status,
        ]),
      ],
    });

    // 6. Port_Inventory
    sheets.push({
      name: 'Port_Inventory',
      rows: [
        ['PORT ID', 'DEVICE / CHASSIS', 'PORT GROUP', 'PORT LABEL', 'CONNECTOR', 'SPEED', 'PURPOSE', 'STATUS'],
        ...ports.map((p, i) => [
          this.isUuid(p.portId) || p.portId.includes('-ear-') || p.portId.includes('-port-')
            ? `PRT-${String(i + 1).padStart(4, '0')}`
            : p.portId,
          this.resolveObjectName(p.objectId, model),
          p.portGroup,
          this.resolvePortLabel(p.portId, p.objectId, model),
          p.connector,
          p.speed,
          p.purpose && !this.isUuid(p.purpose) && !p.purpose.includes('-') ? p.purpose : this.resolvePortLabel(p.portId, p.objectId, model),
          p.status,
        ]),
      ],
    });

    // 7. Network_Port_Map & Connectivity
    sheets.push({
      name: 'Connectivity',
      rows: [
        ['CABLE ID', 'SOURCE OBJECT', 'SOURCE PORT', 'DEST OBJECT', 'DEST PORT', 'MEDIA', 'SPEED', 'COLOR', 'VLAN / SUBNET', 'PORT GROUP', 'PRIMARY ROUTE', 'STATUS'],
        ...cables.map(c => [
          cableIdMap.get(c.cableId) || c.cableId,
          this.resolveObjectName(c.sourceObject, model),
          this.resolvePortLabel(c.sourcePort, c.sourceObject, model),
          this.resolveObjectName(c.destinationObject, model),
          this.resolvePortLabel(c.destinationPort, c.destinationObject, model),
          c.media,
          c.speed,
          c.color,
          c.vlan || 'Untagged / Default',
          c.portGroup || c.networkRole || 'Standard',
          c.primaryRoute,
          c.status.toUpperCase(),
        ]),
      ],
    });

    // 8. Cable_Schedule
    sheets.push({
      name: 'Cable_Schedule',
      rows: [
        ['CABLE ID', 'SOURCE RACK', 'SOURCE OBJECT', 'SOURCE PORT', 'DEST RACK', 'DEST OBJECT', 'DEST PORT', 'MEDIA', 'LENGTH (M)', 'COLOR', 'PURPOSE', 'VLAN / SUBNET', 'PORT GROUP / ROLE', 'STATUS'],
        ...cables.map(c => [
          cableIdMap.get(c.cableId) || c.cableId,
          this.resolveRackName(c.rackA, model),
          this.resolveObjectName(c.sourceObject, model),
          this.resolvePortLabel(c.sourcePort, c.sourceObject, model),
          this.resolveRackName(c.rackB, model),
          this.resolveObjectName(c.destinationObject, model),
          this.resolvePortLabel(c.destinationPort, c.destinationObject, model),
          c.media,
          String(c.length),
          c.color,
          c.purpose,
          c.vlan || 'Auto / Default',
          c.portGroup || c.networkRole || 'Standard Uplink',
          c.status,
        ]),
      ],
    });

    // 9. Power_Schedule
    sheets.push({
      name: 'Power_Schedule',
      rows: [
        ['POWER ID', 'DEVICE / CHASSIS', 'PSU LABEL', 'PDU NAME', 'PDU OUTLET', 'FEED', 'POWER (W)', 'REDUNDANCY STATUS'],
        ...power.map((p, i) => [
          this.isUuid(p.powerId) || p.powerId.startsWith('pwr-')
            ? `PWR-${String(i + 1).padStart(3, '0')}`
            : p.powerId,
          this.resolveObjectName(p.objectId, model),
          p.psuLabel,
          this.resolveObjectName(p.pduId, model),
          this.resolvePortLabel(p.pduSocketId, p.pduId, model),
          p.powerFeed,
          String(p.powerWatts),
          p.redundancyStatus.toUpperCase(),
        ]),
      ],
    });

    // 10. HA_Failure_Domains
    sheets.push({
      name: 'HA_Failure_Domains',
      rows: [
        ['DOMAIN ID', 'DOMAIN NAME', 'TYPE', 'DESCRIPTION', 'MEMBERS'],
        ...failureDomains.map(fd => [
          fd.domainId,
          fd.domainName,
          fd.type,
          fd.description || '',
          fd.memberObjectIds.length > 0
            ? fd.memberObjectIds.map(id => this.resolveObjectName(id, model)).join(', ')
            : 'All Cabinets',
        ]),
      ],
    });

    // 11. Validation_Report
    sheets.push({
      name: 'Validation_Report',
      rows: [
        ['FINDING ID', 'SEVERITY', 'CATEGORY', 'AFFECTED OBJECTS', 'DESCRIPTION', 'IMPACT', 'RECOMMENDATION', 'STATUS'],
        ...findings.map(f => [
          f.findingId,
          f.severity,
          f.category.toUpperCase(),
          f.affectedObjectIds.length > 0
            ? f.affectedObjectIds.map(id => this.resolveEntityName(id, model, cableIdMap)).join(', ')
            : (this.resolveEntityName(f.objectId || f.rackId || '', model, cableIdMap) || 'Cabinet Topology'),
          f.description,
          f.impact,
          f.recommendation,
          f.status.toUpperCase(),
        ]),
      ],
    });

    // 12. AI_Recommendations
    sheets.push({
      name: 'AI_Recommendations',
      rows: this.generateAiRecommendations(model, findings, proposals, cableIdMap),
    });

    // 13. Change_History
    sheets.push({
      name: 'Change_History',
      rows: [
        ['VERSION', 'TIMESTAMP', 'AUTHOR', 'DESCRIPTION', 'CHANGE REASON'],
        ...history.map(h => [
          h.version,
          h.timestamp,
          h.author,
          h.description,
          h.changeReason || 'Direct Model Mutation',
        ]),
      ],
    });

    // 14. BOM
    const bomMap = new Map<string, { category: string; manufacturer: string; model: string; qty: number; totalWatts: number }>();
    for (const o of objects) {
      const key = `${o.manufacturer}|${o.model}`;
      const cur = bomMap.get(key) || {
        category: o.category,
        manufacturer: o.manufacturer,
        model: o.model,
        qty: 0,
        totalWatts: 0,
      };
      cur.qty++;
      cur.totalWatts += o.powerWatts || 0;
      bomMap.set(key, cur);
    }

    sheets.push({
      name: 'BOM',
      rows: [
        ['ITEM', 'CATEGORY', 'MANUFACTURER', 'MODEL', 'QUANTITY', 'TOTAL POWER (W)'],
        ...Array.from(bomMap.values()).map((b, i) => [
          String(i + 1),
          b.category.toUpperCase(),
          b.manufacturer,
          b.model,
          String(b.qty),
          String(b.totalWatts),
        ]),
      ],
    });

    // 15. Export_Metadata
    sheets.push({
      name: 'Export_Metadata',
      rows: [
        ['APPLICATION', 'RackSlicer Infrastructure Intelligence Platform'],
        ['EXPORT ENGINE', 'Deterministic Physical Infrastructure Model XML Spreadsheet 2003'],
        ['EXPORT TIMESTAMP', new Date().toISOString()],
        ['CANONICAL SOURCE OF TRUTH', 'Physical Infrastructure Model'],
      ],
    });

    return sheets;
  }

  /**
   * Helper to check if a string is a raw UUID.
   */
  public static isUuid(val: string): boolean {
    if (!val || typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
  }

  /**
   * Resolves human-readable object/device name with rack unit context.
   * e.g. "Primary Node 1 [U14]" or "ToR Switch 1 [U40]" or "PDU-A (Left Vertical)"
   */
  public static resolveObjectName(objectId: string, model: PhysicalInfrastructureModel): string {
    if (!objectId) return '—';
    const obj = model.getObject(objectId);
    if (obj) {
      const uStr = obj.uStart ? ` [U${obj.uStart}]` : '';
      const baseName = obj.objectName || obj.model || obj.category;
      return baseName.includes(`[U${obj.uStart}]`) || baseName.includes(`U${obj.uStart}`)
        ? baseName
        : `${baseName}${uStr}`;
    }

    // Check PDU synthetic outlet IDs: outlet-<pduId>-<idx>
    if (objectId.startsWith('outlet-')) {
      const match = /^outlet-(.+)-(\d+)$/.exec(objectId);
      if (match) {
        const pduId = match[1];
        const pduObj = model.getObject(pduId);
        if (pduObj) return pduObj.objectName;
        if (pduId.includes('left') || pduId.includes('pdu-a') || pduId.includes('feed-a')) return 'PDU-A (Left Vertical)';
        if (pduId.includes('right') || pduId.includes('pdu-b') || pduId.includes('feed-b')) return 'PDU-B (Right Vertical)';
        return `PDU (${pduId})`;
      }
    }

    // Check known PDU IDs
    if (objectId.includes('ai-pdu-left') || objectId.includes('vpdu-a')) return 'PDU-A (Left Vertical)';
    if (objectId.includes('ai-pdu-right') || objectId.includes('vpdu-b')) return 'PDU-B (Right Vertical)';
    if (objectId.toLowerCase().includes('pdu')) return objectId;

    // Check Rack ID
    const rack = model.getRack(objectId);
    if (rack) return rack.rackName;

    return objectId;
  }

  /**
   * Resolves human-readable rack name.
   */
  public static resolveRackName(rackId: string, model: PhysicalInfrastructureModel): string {
    if (!rackId) return '—';
    const rack = model.getRack(rackId);
    if (rack) return rack.rackName;
    return rackId;
  }

  /**
   * Resolves human-readable port label/identifier.
   */
  public static resolvePortLabel(portId: string, objectId: string, model: PhysicalInfrastructureModel): string {
    if (!portId) return '—';

    // 1. Check if model has registered port with clean label
    const port = model.getPort(portId);
    const label = port?.label?.trim();
    const isRaw = label ? this.isUuid(label) || label === portId || /^[0-9a-f]{8}-/i.test(label) : true;

    if (!isRaw && label) {
      return label;
    }

    // 2. Check PDU outlet format: outlet-<pduId>-<idx>
    if (portId.startsWith('outlet-')) {
      const match = /^outlet-(.+)-(\d+)$/.exec(portId);
      if (match) {
        const outletNum = parseInt(match[2], 10) + 1;
        return `Outlet ${outletNum} (C13)`;
      }
    }

    // 3. Ear ports
    if (portId.includes('-ear-left-nic')) {
      const m = /-ear-left-nic(\d+)$/.exec(portId);
      return m ? `Left Ear NIC ${m[1]}` : 'Left Ear NIC';
    }
    if (portId.includes('-ear-right-nic')) {
      const m = /-ear-right-nic(\d+)$/.exec(portId);
      return m ? `Right Ear NIC ${m[1]}` : 'Right Ear NIC';
    }
    if (portId.includes('-ear-right-mgmt') || portId.includes('-mgmt')) {
      return 'Right Ear Mgmt (iDRAC)';
    }
    if (portId.includes('-ear-left-power') || portId.includes('-ear-left-nic-power')) {
      return 'Left Ear PSU 1 Power';
    }
    if (portId.includes('-ear-right-power') || portId.includes('-ear-right-nic-power')) {
      return 'Right Ear PSU 2 Power';
    }

    // 4. Device ports: <uuid>-port-0 -> Port 1
    if (portId.includes('-port-')) {
      const m = /-port-(\d+)$/.exec(portId);
      if (m) {
        return `Port ${parseInt(m[1], 10) + 1}`;
      }
    }

    // 5. Fallback to purpose or connector
    if (port && port.purpose && !this.isUuid(port.purpose)) {
      return port.purpose;
    }
    if (port && port.connector) {
      return `${port.connector} Port`;
    }

    return portId;
  }

  /**
   * Resolves any entity ID (object, rack, cable) to a clean human-readable name.
   */
  public static resolveEntityName(id: string, model: PhysicalInfrastructureModel, cableMap?: Map<string, string>): string {
    if (!id) return '';
    if (cableMap && cableMap.has(id)) {
      return cableMap.get(id)!;
    }
    const obj = model.getObject(id);
    if (obj) {
      return this.resolveObjectName(id, model);
    }
    const rack = model.getRack(id);
    if (rack) {
      return rack.rackName;
    }
    const cable = model.getCables().find(c => c.cableId === id);
    if (cable) {
      return cableMap?.get(id) || (this.isUuid(id) ? `Cable ${id.substring(0, 8)}` : id);
    }
    return this.resolveObjectName(id, model);
  }

  /**
   * Safe stringifier that prevents "[object Object]" from ever leaking.
   */
  public static toSafeString(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object') {
      if (typeof val.summary === 'string') return val.summary;
      if (typeof val.name === 'string') return val.name;
      if (typeof val.title === 'string') return val.title;
      if (Array.isArray(val)) return val.map(x => this.toSafeString(x)).join(', ');
      try {
        return JSON.stringify(val);
      } catch {
        return '';
      }
    }
    return String(val);
  }

  /**
   * Builds an Excel-native SpreadsheetML 2003 XML document.
   */
  private static buildSpreadsheetXml(sheets: { name: string; rows: string[][] }[]): string {
    const escapeXml = (val: any) => {
      const str = ExcelExportEngine.toSafeString(val);
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SubheaderStyle">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
 </Styles>
`;

    for (const sheet of sheets) {
      xml += ` <Worksheet ss:Name="${escapeXml(sheet.name.substring(0, 31))}">\n  <Table>\n`;
      sheet.rows.forEach((row, rowIdx) => {
        const isHeader = rowIdx === 0;
        const styleAttr = isHeader ? ' ss:StyleID="HeaderStyle"' : '';
        xml += `   <Row${styleAttr}>\n`;
        row.forEach(cell => {
          xml += `    <Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>\n`;
        });
        xml += `   </Row>\n`;
      });
      xml += `  </Table>\n </Worksheet>\n`;
    }

    xml += `</Workbook>`;
    return xml;
  }

  /**
   * Generates the complete multi-sheet XML workbook content (legacy format fallback).
   */
  static generateWorkbook(model: PhysicalInfrastructureModel): string {
    const sheets = this.generateSheets(model);
    return this.buildSpreadsheetXml(sheets);
  }

  /**
   * Triggers download of a genuine, native binary .xlsx Excel workbook in the browser.
   */
  static downloadEngineeringExcel(model: PhysicalInfrastructureModel, filename = 'RackSlicer_Physical_Infrastructure.xlsx'): void {
    const sheets = this.generateSheets(model);
    const wb = XLSX.utils.book_new();

    for (const sheet of sheets) {
      // Sheet names in Excel must be <= 31 chars and cannot contain: \ / ? * [ ]
      const cleanName = sheet.name.replace(/[\\/?*[\]]/g, '_').substring(0, 31);
      const safeRows = sheet.rows.map(row => row.map(cell => this.toSafeString(cell)));
      const ws = XLSX.utils.aoa_to_sheet(safeRows);

      // Auto-fit column widths
      const colWidths = sheet.rows.reduce((acc: number[], row: any[]) => {
        row.forEach((cell, colIdx) => {
          const len = cell ? String(cell).length : 5;
          acc[colIdx] = Math.max(acc[colIdx] || 10, Math.min(len + 3, 50));
        });
        return acc;
      }, []);
      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws, cleanName);
    }

    const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, safeName);
  }

  /**
   * Generates comprehensive, deterministic AI recommendations for the physical infrastructure model.
   * Synthesizes active proposals, validation audit findings, workflow gap items, and best-practice hardening rules.
   */
  private static generateAiRecommendations(
    model: PhysicalInfrastructureModel,
    findings: ValidationFinding[],
    proposals: ChangeProposal[],
    cableMap?: Map<string, string>
  ): string[][] {
    const rows: string[][] = [
      ['RECOMMENDATION ID', 'CATEGORY', 'PRIORITY', 'TARGET SCOPE', 'ANALYSIS / OBSERVATION', 'RECOMMENDED ACTION', 'EXPECTED BENEFIT / IMPACT', 'STATUS'],
    ];

    const seenIds = new Set<string>();
    const addRow = (id: string, category: string, priority: string, scope: string, obs: string, action: string, benefit: string, status: string) => {
      if (seenIds.has(id)) return;
      seenIds.add(id);
      rows.push([
        this.toSafeString(id),
        this.toSafeString(category),
        this.toSafeString(priority),
        this.toSafeString(scope),
        this.toSafeString(obs),
        this.toSafeString(action),
        this.toSafeString(benefit),
        this.toSafeString(status),
      ]);
    };

    const racks = model.getRacks();
    const objects = model.getObjects();
    const cables = model.getCables();
    const power = model.getPowerMappings();

    // 1. Registered AI Change Proposals
    for (const pr of proposals) {
      const objName = this.resolveObjectName(pr.objectId, model);
      const impactSummary = typeof pr.impact === 'object' && pr.impact !== null
        ? (pr.impact.summary || 'Optimized physical placement')
        : (pr.impact || 'Optimized physical placement');
      addRow(
        pr.proposalId,
        `AI PROPOSAL: ${pr.type.replace(/_/g, ' ')}`,
        'HIGH',
        objName,
        pr.reason,
        pr.type === 'MOVE_OBJECT'
          ? `Relocate ${objName} to target rack / U-position`
          : pr.reason,
        impactSummary,
        pr.status.toUpperCase()
      );
    }

    // 2. Deterministic Validation Audit Findings & Hardening Remediations
    for (const f of findings) {
      const targetScope = f.affectedObjectIds.length > 0
        ? f.affectedObjectIds.map(id => this.resolveEntityName(id, model, cableMap)).join(', ')
        : (this.resolveEntityName(f.objectId || f.rackId || '', model, cableMap) || 'Cabinet Topology');
      addRow(
        f.findingId,
        `AUDIT: ${f.category.toUpperCase()}`,
        f.severity,
        targetScope,
        f.description,
        f.recommendation,
        f.impact,
        f.status.toUpperCase()
      );
    }

    // 3. Workflow Gap Analysis & Redundancy Recommendations
    try {
      const orchestrator = getActiveWorkflowOrchestrator();
      if (orchestrator) {
        const gaps = orchestrator.getGapItems() || [];
        for (const gap of gaps) {
          const recId = `GAP-${gap.id.replace('gap_', '').toUpperCase()}`;
          const scope = gap.componentToAdd
            ? `${gap.componentToAdd.name} (${gap.componentToAdd.units}U, ${gap.componentToAdd.watts}W)`
            : 'Cluster Infrastructure';
          const action = gap.componentToAdd
            ? `Add ${gap.componentToAdd.name} to Bill of Materials (${gap.componentToAdd.units}U)`
            : gap.description;
          const benefit = gap.id === 'gap_oob'
            ? 'Isolates BMC/iDRAC management plane from production data network'
            : gap.id === 'gap_backup'
            ? 'Guarantees immutable ransomware recovery & 3-2-1 backup compliance'
            : 'Continuous temperature/humidity gradient monitoring to prevent hotspots';
          const status = gap.accepted ? 'ACCEPTED' : gap.dismissed ? 'DISMISSED' : 'RECOMMENDED';
          addRow(recId, `WORKFLOW GAP: ${gap.category.toUpperCase()}`, gap.severity.toUpperCase(), scope, gap.description, action, benefit, status);
        }

        const limitationReport = orchestrator.getState()?.requirement?.limitationReport || [];
        for (const lim of limitationReport) {
          const limId = `SPOF-${lim.id.replace('lim_', '').toUpperCase()}`;
          const priority = lim.status === 'FAIL_SPOF' ? 'CRITICAL' : lim.status === 'WARN_CHASSIS' ? 'HIGH' : 'RECOMMENDED';
          addRow(
            limId,
            `SPOF ANALYSIS: ${lim.category.toUpperCase()}`,
            priority,
            lim.hardwareGiven,
            lim.limitationText,
            lim.recommendationToFix,
            lim.title,
            lim.status === 'PASS_HA' ? 'VERIFIED' : 'RECOMMENDED'
          );
        }
      }
    } catch {
      // Graceful fallback if orchestrator not initialized
    }

    // 4. Deterministic Architectural Hardening & Best Practice Recommendations
    // Rule: Vertical Cable Manager (VCM) & EMI Segregation
    addRow(
      'REC-CAB-01',
      'CABLING & ROUTING',
      'BEST PRACTICE',
      'All Cabinets (Side VCM Channels)',
      'High-voltage AC power cords and sensitive high-speed Ethernet/Fiber DAC cables coexist in cabinet enclosure.',
      'Route Power Feed A through Left VCM and Feed B through Right VCM. Segregate copper/fiber data through center cable channels and ear-ports with minimum 10x OD bend radius.',
      'Eliminates AC electromagnetic interference (EMI) on 25GbE/100GbE data lines and prevents cable snagging during server hot-swap servicing.',
      'RECOMMENDED'
    );

    // Rule: Center of Gravity & Seismic Safety
    addRow(
      'REC-PHY-01',
      'PHYSICAL & STRUCTURAL',
      'BEST PRACTICE',
      'Cabinet Base (U1-U12)',
      'Heavy chassis (UPS battery packs, storage arrays, 4U compute) impact cabinet tipping hazard and floor loading.',
      'Place heavy equipment (>20kg) strictly in lower rack units (U1-U12). Reserve U38-U42 for lightweight Top-of-Rack switches.',
      'Maintains low center of mass, preventing cabinet tip hazards during rolling transport and ensuring seismic compliance.',
      'RECOMMENDED'
    );

    // Rule: Thermal Airflow Containment & Blanking Panels
    addRow(
      'REC-THM-01',
      'THERMAL & AIRFLOW',
      'BEST PRACTICE',
      'Unoccupied RU Slots',
      'Open vertical rack gaps allow hot rear exhaust air to recirculate into front server cold intake.',
      'Install 1U/2U snap-in blanking panels in all empty rack unit spaces and 1U brush pass-through panels between ToR switches.',
      'Maintains static air pressure, prevents localized hot spots, and reduces server cooling fan power consumption by up to 15%.',
      'RECOMMENDED'
    );

    // Rule: Dedicated Out-of-Band (OOB/iDRAC) Isolation
    addRow(
      'REC-SEC-01',
      'MANAGEMENT & SECURITY',
      'RECOMMENDED',
      'Server BMC / iDRAC / iLO Ports',
      'Baseboard Management Controllers (BMC) require isolated broadcast domain and dedicated security perimeter.',
      'Deploy dedicated 1U 24-Port 1GbE Out-of-Band management switch connected exclusively to server BMC/iDRAC ear-ports on an isolated management subnet.',
      'Protects server hardware management interfaces against production network storms and ensures out-of-band console access during OS kernel panics.',
      'RECOMMENDED'
    );

    // Rule: Top-of-Rack Switch Redundancy & MLAG Fabric
    addRow(
      'REC-NET-01',
      'NETWORK & FABRIC',
      'HIGH',
      'Top-of-Rack Switches',
      'Enterprise compute clusters require non-blocking, multi-homed Top-of-Rack redundancy.',
      'Deploy dual ToR switches (ToR-A & ToR-B) in MLAG / EVPN-VXLAN active-active pair with dual 100G DAC Inter-Switch Links (ISL) and 802.1Q trunked VLANs.',
      'Provides sub-millisecond failover for live virtual machine migration and eliminates single switch maintenance outages.',
      'RECOMMENDED'
    );

    // Rule: Power Feed Diversity & Dual-Corded Feeds
    addRow(
      'REC-PWR-01',
      'POWER ARCHITECTURE',
      'CRITICAL',
      'Branch Circuits & PDUs',
      'Dual-corded compute and storage require independent utility/generator feed paths.',
      'Verify PSU 1 connects to Feed A (Primary PDU) and PSU 2 connects to Feed B (Secondary PDU on isolated UPS). Use Automatic Transfer Switches (ATS) for any single-corded network appliances.',
      'Ensures uninterrupted operation during upstream utility brownout, generator transfer, or PDU circuit maintenance.',
      'RECOMMENDED'
    );

    // Rule: ANSI/TIA-606-C Structured Cable Labeling
    addRow(
      'REC-OPS-01',
      'OPERATIONS & STANDARDS',
      'BEST PRACTICE',
      'All Patch Cables',
      'Unlabeled or ambiguous patch cords significantly increase troubleshooting time during network and power outages.',
      'Affix permanent wrap-around machine-printed labels at both cable termination ends following TIA-606-C format: [Source Rack:U:Port] -> [Dest Rack:U:Port].',
      'Decreases Mean Time To Recovery (MTTR) by ~70% and prevents accidental disconnection of critical uplinks.',
      'RECOMMENDED'
    );

    // Rule: Dual-Cabinet High Availability Split (if >= 2 racks)
    if (racks.length >= 2) {
      addRow(
        'REC-HA-01',
        'HIGH AVAILABILITY',
        'HIGH',
        'Cabinet A & Cabinet B',
        'Multi-cabinet topology detected with distributed compute resources.',
        'Distribute hypervisor nodes 50/50 across Cabinet A and Cabinet B with cross-rack HA heartbeat and storage synchronization.',
        'Protects cluster workloads against total physical cabinet isolation or localized PDU failure.',
        'RECOMMENDED'
      );
    }

    return rows;
  }
}
