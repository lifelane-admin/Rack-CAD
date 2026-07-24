import { RackData, DeviceData, CableData, RACK_CONSTANTS } from '../core/types';
import { createGroup, createRect, createText, createSVGElement, setAttributes } from '../utils/svg-helpers';
import { stateManager } from '../core/state';

export function renderDashboardWidgets(
  rack: RackData,
  devices: DeviceData[],
  cables: CableData[],
  parentGroup: SVGGElement
): void {
  const dashGroup = createGroup('rack-' + rack.id + '-dashboard', 'dashboard-widgets');
  
  // Translate to rack position so it moves with the rack!
  setAttributes(dashGroup, {
    transform: `translate(${rack.x}, ${rack.y})`
  });

  const totalHeight = RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units * RACK_CONSTANTS.RU_HEIGHT) + RACK_CONSTANTS.RACK_PADDING_BOTTOM;

  // === 1. NETWORK LEGEND CARD ===
  const legendX = RACK_CONSTANTS.RACK_OUTER_WIDTH + 45;
  const legendY = 30;
  const legendWidth = 265;
  const legendHeight = 310;

  // Background Glass Card
  const legendBg = createRect(legendX, legendY, legendWidth, legendHeight, {
    fill: '#161b22',
    stroke: '#30363d',
    'stroke-width': 1.5,
    rx: 6,
    ry: 6,
    opacity: 0.95
  });
  dashGroup.appendChild(legendBg);

  // Card Header
  const legendHeader = createText(legendX + legendWidth / 2, legendY + 22, 'NETWORK LEGEND', {
    fill: '#fb8c00',
    'font-size': 11,
    'font-weight': 'bold',
    'font-family': 'Inter, sans-serif',
    'text-anchor': 'middle',
    'letter-spacing': '1px'
  });
  dashGroup.appendChild(legendHeader);

  // Line Divider
  dashGroup.appendChild(createSVGElement('line', {
    x1: legendX + 15,
    y1: legendY + 32,
    x2: legendX + legendWidth - 15,
    y2: legendY + 32,
    stroke: '#30363d',
    'stroke-width': 1
  }));

  // Determine legend items dynamically (Custom user defined > Active cables > Clean blank state)
  const s = stateManager.getState();
  let legendItems: { label: string; color: string }[] = [];

  if (s.customLegendItems && s.customLegendItems.length > 0) {
    legendItems = s.customLegendItems;
  } else if (cables.length > 0) {
    // Generate unique legend entries from current project cables
    const seenMap = new Map<string, { label: string; color: string }>();
    cables.forEach(c => {
      const key = `${c.type}-${c.color}`;
      if (!seenMap.has(key)) {
        seenMap.set(key, {
          label: `${c.displayName || c.name || c.type.toUpperCase()}`,
          color: c.color
        });
      }
    });
    legendItems = Array.from(seenMap.values());
  }

  if (legendItems.length === 0) {
    // Blank placeholder message when no cables or custom items exist
    const emptyText = createText(legendX + legendWidth / 2, legendY + 120, '(No Cables Routed Yet)', {
      fill: '#8b949e',
      'font-size': 10,
      'font-family': 'Inter, sans-serif',
      'text-anchor': 'middle'
    });
    const editHint = createText(legendX + legendWidth / 2, legendY + 140, 'Use Right-Click or Toolbar to add cables & legend items', {
      fill: '#484f58',
      'font-size': 8.5,
      'font-family': 'Inter, sans-serif',
      'text-anchor': 'middle'
    });
    dashGroup.appendChild(emptyText);
    dashGroup.appendChild(editHint);
  } else {
    legendItems.slice(0, 9).forEach((item, index) => {
      const itemY = legendY + 50 + index * 26;
      
      // Color wire sample
      const wire = createSVGElement('line', {
        x1: legendX + 20,
        y1: itemY,
        x2: legendX + 45,
        y2: itemY,
        stroke: item.color,
        'stroke-width': 3.5,
        'stroke-linecap': 'round'
      });
      dashGroup.appendChild(wire);

      // Label Text
      const label = createText(legendX + 55, itemY + 3.5, item.label, {
        fill: '#c9d1d9',
        'font-size': 9,
        'font-family': 'Inter, sans-serif'
      });
      dashGroup.appendChild(label);
    });
  }


  // === 2. RACK SUMMARY CARD ===
  const sumY = legendY + legendHeight + 25;
  const sumHeight = 230;

  // Background
  const sumBg = createRect(legendX, sumY, legendWidth, sumHeight, {
    fill: '#161b22',
    stroke: '#30363d',
    'stroke-width': 1.5,
    rx: 6,
    ry: 6,
    opacity: 0.95
  });
  dashGroup.appendChild(sumBg);

  // Card Header
  const sumHeader = createText(legendX + legendWidth / 2, sumY + 22, 'RACK SUMMARY', {
    fill: '#fb8c00',
    'font-size': 11,
    'font-weight': 'bold',
    'font-family': 'Inter, sans-serif',
    'text-anchor': 'middle',
    'letter-spacing': '1px'
  });
  dashGroup.appendChild(sumHeader);

  // Line Divider
  dashGroup.appendChild(createSVGElement('line', {
    x1: legendX + 15,
    y1: sumY + 32,
    x2: legendX + legendWidth - 15,
    y2: sumY + 32,
    stroke: '#30363d',
    'stroke-width': 1
  }));

  // Equipment count summary calculated dynamically from active project devices & rack
  const swCount = devices.filter(d => (d.templateId && d.templateId.includes('switch')) || (d.name && d.name.toLowerCase().includes('switch'))).length;
  const srvCount = devices.filter(d => (d.templateId && (d.templateId.includes('dell') || d.templateId.includes('hpe') || d.templateId.includes('smc'))) || (d.name && d.name.toLowerCase().includes('server'))).length;
  const otherDevCount = Math.max(0, devices.length - swCount - srvCount);
  const pduCount = (rack.showPduLeft !== false ? 1 : 0) + (rack.showPduRight !== false ? 1 : 0);
  const unitsUsed = devices.reduce((sum, d) => sum + (d.ports ? 1 : 1), 0); // calculate RU height dynamically

  const summaryItems = [
    `• ${swCount} x Network Switches`,
    `• ${srvCount} x Compute Servers`,
    `• ${otherDevCount > 0 ? `${otherDevCount} x Other Rack Appliances` : '• 0 x Storage Appliances'}`,
    `• ${pduCount} x Cabinet Vertical PDUs`,
    `• Total Units Occupied: ${unitsUsed}U / ${rack.units}U`,
    `• Active Cable Links: ${cables.length} Cables`,
    `• Status: ${cables.length > 0 ? 'Connected' : 'Ready'}`
  ];

  summaryItems.forEach((text, index) => {
    const itemY = sumY + 52 + index * 23;
    const bulletText = createText(legendX + 20, itemY + 3, text, {
      fill: '#c9d1d9',
      'font-size': 9.5,
      'font-family': 'Inter, sans-serif'
    });
    dashGroup.appendChild(bulletText);
  });


  // === 3. PORT MAPPING TABLES (at the bottom) ===
  const tableY = totalHeight + 35;
  const tableWidth = 265;
  
  // Table 1: Left (x: -260 relative to rack.x = 0, or x: -220)
  // Let's place it at x: -220, x: 80, x: 380...
  // Wait, let's arrange them side by side under the rack:
  // Table 1: x: -220, Table 2: x: 80, Table 3: x: 380
  const t1X = -210;
  const t2X = 85;
  const t3X = 380;
  const tables = [
    {
      x: t1X,
      title: '10GbE TOR SWITCH PORT MAP',
      headers: ['PORT', 'COLOR', 'NETWORK', 'TARGET'],
      rows: [
        ['Port 1-4', 'Purple', 'Ceph Sec', 'Nodes 1-3'],
        ['Port 5', 'Green', 'Ceph Pri', 'Node 3'],
        ['Port 6', 'Orange', 'VM Net', 'Node 3'],
        ['Port 7-8', 'Yellow', 'Live Mig', 'Nodes 1-2'],
        ['Port 9-10', 'Green', 'Ceph Pri', 'Nodes 1-2'],
        ['Port 11-12', 'Orange', 'VM Net', 'Nodes 1-2']
      ]
    },
    {
      x: t2X,
      title: '1GbE MGMT SWITCH CONNECTIONS',
      headers: ['PORT', 'COLOR', 'NETWORK', 'TARGET'],
      rows: [
        ['Ports 1-3', 'Red', 'iDRAC OOB', 'Nodes 1-3'],
        ['Port 4', 'Red', 'iDRAC OOB', 'Backup Srv'],
        ['Ports 5-7', 'Grey', 'OS Mgmt', 'Nodes 1-3'],
        ['Port 8', 'Cyan', 'General A', 'Nodes Gen'],
        ['Port 9', 'Pink', 'General B', 'Nodes Gen'],
        ['Port 10', 'Blue', 'Backup PBS', 'Backup Srv']
      ]
    },
    {
      x: t3X,
      title: 'SERVER NIC PORT INTERFACES',
      headers: ['DEVICE', 'NIC', 'COLOR', 'NETWORK'],
      rows: [
        ['Dell Node 1-3', 'NIC 1', 'Orange', 'VM Network'],
        ['Dell Node 1-3', 'NIC 2', 'Green', 'Ceph Primary'],
        ['Dell Node 1-3', 'NIC 3', 'Purple', 'Ceph Second'],
        ['Dell Node 1-3', 'NIC 4', 'Yellow', 'Live Migration'],
        ['Dell Node 1-3', 'NIC 5', 'Red', 'iDRAC OOB'],
        ['Backup Node', 'NIC 1', 'Blue', 'Backup PBS']
      ]
    }
  ];

  tables.forEach(table => {
    // Table container background
    const bg = createRect(table.x, tableY, tableWidth, 195, {
      fill: '#161b22',
      stroke: '#30363d',
      'stroke-width': 1.5,
      rx: 5,
      ry: 5,
      opacity: 0.95
    });
    dashGroup.appendChild(bg);

    // Title
    const titleText = createText(table.x + tableWidth / 2, tableY + 20, table.title, {
      fill: '#fb8c00',
      'font-size': 9,
      'font-weight': 'bold',
      'font-family': 'Inter, sans-serif',
      'text-anchor': 'middle',
      'letter-spacing': '0.5px'
    });
    dashGroup.appendChild(titleText);

    // Divider
    dashGroup.appendChild(createSVGElement('line', {
      x1: table.x + 10,
      y1: tableY + 28,
      x2: table.x + tableWidth - 10,
      y2: tableY + 28,
      stroke: '#30363d',
      'stroke-width': 1
    }));

    // Headers
    const headY = tableY + 42;
    table.headers.forEach((h, idx) => {
      const colX = table.x + 12 + idx * (tableWidth - 24) / table.headers.length;
      const text = createText(colX, headY, h, {
        fill: '#8b949e',
        'font-size': 7.5,
        'font-weight': 'bold',
        'font-family': 'Inter, sans-serif'
      });
      dashGroup.appendChild(text);
    });

    // Divider below headers
    dashGroup.appendChild(createSVGElement('line', {
      x1: table.x + 10,
      y1: tableY + 48,
      x2: table.x + tableWidth - 10,
      y2: tableY + 48,
      stroke: '#21262d',
      'stroke-width': 0.8
    }));

    // Rows
    table.rows.forEach((row, rowIdx) => {
      const rowY = tableY + 63 + rowIdx * 21;

      // Subtle row striping background
      if (rowIdx % 2 === 1) {
        dashGroup.appendChild(createRect(table.x + 8, rowY - 12, tableWidth - 16, 17, {
          fill: '#21262d',
          opacity: 0.3,
          rx: 2
        }));
      }

      row.forEach((cell, cellIdx) => {
        const colX = table.x + 12 + cellIdx * (tableWidth - 24) / table.headers.length;
        
        // Check if cell is a color name, render it as a tiny colored tag badge!
        const isColorCell = cellIdx === 1 && ['Orange', 'Green', 'Purple', 'Yellow', 'Blue', 'Red', 'Grey', 'Cyan', 'Pink'].includes(cell);
        
        if (isColorCell) {
          const badgeColors: Record<string, string> = {
            'Orange': '#fb8c00',
            'Green': '#43a047',
            'Purple': '#8e24aa',
            'Yellow': '#fdd835',
            'Blue': '#1e88e5',
            'Red': '#e53935',
            'Grey': '#78909c',
            'Cyan': '#00acc1',
            'Pink': '#d81b60'
          };
          const badgeColor = badgeColors[cell] || '#78909c';
          
          // Badge background
          const badge = createRect(colX, rowY - 8, 38, 11, {
            fill: badgeColor,
            rx: 2,
            ry: 2
          });
          dashGroup.appendChild(badge);

          // Badge Text
          const badgeTxt = createText(colX + 19, rowY + 0.5, cell, {
            fill: '#ffffff',
            'font-size': 6.5,
            'font-weight': 'bold',
            'font-family': 'Inter, sans-serif',
            'text-anchor': 'middle'
          });
          dashGroup.appendChild(badgeTxt);
        } else {
          // Standard text cell
          const text = createText(colX, rowY, cell, {
            fill: '#c9d1d9',
            'font-size': 8,
            'font-family': 'Inter, sans-serif'
          });
          dashGroup.appendChild(text);
        }
      });
    });
  });

  parentGroup.appendChild(dashGroup);
}

// Local template helper matching main catalog
function getTemplate(id: string) {
  const templates: Record<string, { heightUnits: number }> = {
    'dell-r760': { heightUnits: 2 },
    'dell-r660': { heightUnits: 1 },
    'hpe-dl380': { heightUnits: 2 },
    'hpe-dl360': { heightUnits: 1 },
    'tor-switch-10g': { heightUnits: 1 },
    'mgmt-switch-24p': { heightUnits: 1 }
  };
  return templates[id] || { heightUnits: 1 };
}
