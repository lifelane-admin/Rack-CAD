/**
 * Infrastructure Topology Graph
 * Graph representation of physical infrastructure: racks, devices, ports, cables, and power feeds.
 */

import {
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalConnection,
  PhysicalCable,
  PhysicalPower,
} from './types';

export interface GraphNode {
  id: string;
  type: 'rack' | 'object' | 'port' | 'psu' | 'pdu' | 'socket' | 'ups';
  label: string;
  parentId?: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'contains' | 'cabled_to' | 'powers' | 'member_of';
  metadata?: Record<string, any>;
}

export class InfrastructureGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private adjacency = new Map<string, Set<string>>();

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
  }

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
    if (!this.adjacency.has(edge.source)) this.adjacency.set(edge.source, new Set());
    if (!this.adjacency.has(edge.target)) this.adjacency.set(edge.target, new Set());
    this.adjacency.get(edge.source)!.add(edge.target);
    this.adjacency.get(edge.target)!.add(edge.source);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  getNeighbors(nodeId: string): string[] {
    return Array.from(this.adjacency.get(nodeId) || []);
  }

  /**
   * Builds the entire topology graph from current Physical Infrastructure Model entities.
   */
  static buildFromModel(
    racks: PhysicalRack[],
    objects: PhysicalObject[],
    ports: PhysicalPort[],
    cables: PhysicalCable[],
    power: PhysicalPower[]
  ): InfrastructureGraph {
    const graph = new InfrastructureGraph();

    // 1. Racks
    for (const rack of racks) {
      graph.addNode({
        id: rack.rackId,
        type: 'rack',
        label: rack.rackName,
        metadata: { ...rack },
      });
    }

    // 2. Physical Objects
    for (const obj of objects) {
      graph.addNode({
        id: obj.objectId,
        type: 'object',
        label: obj.objectName,
        parentId: obj.rackId,
        metadata: { ...obj },
      });

      // Edge from Rack to Object
      graph.addEdge({
        id: `edge-${obj.rackId}-contains-${obj.objectId}`,
        source: obj.rackId,
        target: obj.objectId,
        type: 'contains',
      });
    }

    // 3. Ports
    for (const port of ports) {
      graph.addNode({
        id: port.portId,
        type: 'port',
        label: `${port.label} (${port.portType})`,
        parentId: port.objectId,
        metadata: { ...port },
      });

      // Edge from Object to Port
      graph.addEdge({
        id: `edge-${port.objectId}-has-${port.portId}`,
        source: port.objectId,
        target: port.portId,
        type: 'contains',
      });
    }

    // 4. Cables (Port-to-Port connectivity)
    for (const cable of cables) {
      if (cable.sourcePort && cable.destinationPort) {
        graph.addEdge({
          id: `cable-edge-${cable.cableId}`,
          source: cable.sourcePort,
          target: cable.destinationPort,
          type: 'cabled_to',
          metadata: { ...cable },
        });
      }
    }

    // 5. Power feeds (Object PSU -> PDU Socket -> PDU)
    for (const pwr of power) {
      const psuNodeId = `${pwr.objectId}-psu-${pwr.psuId}`;
      const socketNodeId = `${pwr.pduId}-socket-${pwr.pduSocketId}`;

      graph.addNode({
        id: psuNodeId,
        type: 'psu',
        label: pwr.psuLabel,
        parentId: pwr.objectId,
        metadata: { powerWatts: pwr.powerWatts, feed: pwr.powerFeed },
      });

      graph.addNode({
        id: socketNodeId,
        type: 'socket',
        label: `Outlet ${pwr.pduSocketId}`,
        parentId: pwr.pduId,
        metadata: { pduId: pwr.pduId, socketType: pwr.socketType, feed: pwr.powerFeed },
      });

      // Connect object to its PSU
      graph.addEdge({
        id: `edge-${pwr.objectId}-psu-${pwr.psuId}`,
        source: pwr.objectId,
        target: psuNodeId,
        type: 'contains',
      });

      // Connect PDU to its Socket
      graph.addEdge({
        id: `edge-${pwr.pduId}-socket-${pwr.pduSocketId}`,
        source: pwr.pduId,
        target: socketNodeId,
        type: 'contains',
      });

      // Connect PSU to Socket via Power Cable
      graph.addEdge({
        id: `edge-power-${pwr.powerId}`,
        source: psuNodeId,
        target: socketNodeId,
        type: 'powers',
        metadata: { powerWatts: pwr.powerWatts, feed: pwr.powerFeed },
      });
    }

    return graph;
  }
}
