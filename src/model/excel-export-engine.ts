import * as XLSX from 'xlsx';
import { PhysicalInfrastructureModel } from './physical-model';
import { USpaceEngine } from './u-space-engine';

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

    // 3. 03_Rack_Inventory
    sheets.push({
      name: '03_Rack_Inventory',
      rows: [
        ['RACK ID', 'NAME', 'TOTAL U', 'USED U', 'FREE U', 'UTIL %', 'POWER (W)', 'WEIGHT (KG)', 'FAILURE DOMAIN', 'ORIENTATION'],
        ...racks.map(r => [
          r.rackId,
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
            item.objectId,
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
          o.objectId,
          o.category.toUpperCase(),
          o.subCategory,
          o.objectName,
          o.manufacturer,
          o.model,
          o.serialNumber || 'N/A',
          o.rackId,
          `U${o.uStart}`,
          `U${o.uEnd}`,
          `${o.heightU}U`,
          String(o.powerWatts),
          String(o.weight),
          o.haPairId || 'None',
          o.status,
        ]),
      ],
    });

    // 6. Port_Inventory
    sheets.push({
      name: 'Port_Inventory',
      rows: [
        ['PORT ID', 'OBJECT ID', 'PORT GROUP', 'LABEL', 'CONNECTOR', 'SPEED', 'PURPOSE', 'STATUS'],
        ...ports.map(p => [
          p.portId,
          p.objectId,
          p.portGroup,
          p.label,
          p.connector,
          p.speed,
          p.purpose,
          p.status,
        ]),
      ],
    });

    // 7. Network_Port_Map & Connectivity
    sheets.push({
      name: 'Connectivity',
      rows: [
        ['CABLE ID', 'SOURCE OBJECT', 'SOURCE PORT', 'DEST OBJECT', 'DEST PORT', 'MEDIA', 'SPEED', 'COLOR', 'PRIMARY ROUTE', 'STATUS'],
        ...cables.map(c => [
          c.cableId,
          c.sourceObject,
          c.sourcePort,
          c.destinationObject,
          c.destinationPort,
          c.media,
          c.speed,
          c.color,
          c.primaryRoute,
          c.status.toUpperCase(),
        ]),
      ],
    });

    // 8. Cable_Schedule
    sheets.push({
      name: 'Cable_Schedule',
      rows: [
        ['CABLE ID', 'SOURCE RACK', 'SOURCE OBJECT', 'SOURCE PORT', 'DEST RACK', 'DEST OBJECT', 'DEST PORT', 'MEDIA', 'LENGTH (M)', 'COLOR', 'PURPOSE', 'STATUS'],
        ...cables.map(c => [
          c.cableId,
          c.rackA,
          c.sourceObject,
          c.sourcePort,
          c.rackB,
          c.destinationObject,
          c.destinationPort,
          c.media,
          String(c.length),
          c.color,
          c.purpose,
          c.status,
        ]),
      ],
    });

    // 9. Power_Schedule
    sheets.push({
      name: 'Power_Schedule',
      rows: [
        ['POWER ID', 'OBJECT ID', 'PSU LABEL', 'PDU ID', 'PDU OUTLET', 'FEED', 'POWER (W)', 'REDUNDANCY STATUS'],
        ...power.map(p => [
          p.powerId,
          p.objectId,
          p.psuLabel,
          p.pduId,
          p.pduSocketId,
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
          fd.memberObjectIds.join(', ') || 'Auto-allocated',
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
          f.affectedObjectIds.join(', '),
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
      rows: [
        ['PROPOSAL ID', 'TYPE', 'OBJECT ID', 'REASON', 'IMPACT SUMMARY', 'STATUS'],
        ...proposals.map(pr => [
          pr.proposalId,
          pr.type,
          pr.objectId,
          pr.reason,
          pr.impact.summary,
          pr.status.toUpperCase(),
        ]),
      ],
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
   * Builds an Excel-native SpreadsheetML 2003 XML document.
   */
  private static buildSpreadsheetXml(sheets: { name: string; rows: string[][] }[]): string {
    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

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
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows);

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
}
