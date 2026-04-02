import React, { useEffect, useState } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

import { API } from "../constants";

const GraphView = ({ repoId, onClose }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoId) return;
    
    const fetchGraph = async () => {
      try {
        const res = await fetch(`${API}/graph/${repoId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const data = await res.json();
        
        // Simple circular/grid layout since backend returns 0,0
        const formattedNodes = data.nodes.map((node, i) => ({
          ...node,
          position: { 
            x: (i % 5) * 200, 
            y: Math.floor(i / 5) * 150 
          },
          style: { 
            background: '#1a202c', 
            color: '#fff', 
            border: '1px solid #4a5568',
            borderRadius: '8px',
            fontSize: '12px',
            width: 150
          }
        }));
        
        setNodes(formattedNodes);
        setEdges(data.edges);
      } catch (e) {
        console.error("Failed to fetch graph", e);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [repoId]);

  return (
    <div className="graph-overlay">
      <div className="graph-container">
        <div className="graph-header">
          <h3>Code Dependency Map</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="graph-wrap">
          {loading ? (
            <div className="loading-spinner">Mapping dependencies...</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
            >
              <Background color="#2d3748" gap={20} />
              <Controls />
              <MiniMap 
                nodeColor={() => '#63b3ed'} 
                maskColor="rgba(0,0,0,0.1)"
                style={{ background: '#1a202c' }}
              />
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  );
};

export default GraphView;
