export function Legend() {
  return (
    <div className="legend">
      <div className="legend-item"><span className="badge b6x">6X</span> DLSS 4.5 MFG 6X</div>
      <div className="legend-item"><span className="badge b4x">4X</span> DLSS 4 MFG 4X</div>
      <div className="legend-item"><span className="badge bnvt">NV-T</span> Transformer model</div>
      <div className="legend-item"><span className="badge bnvu">NV-U</span> Updated model</div>
      <div className="legend-item"><span className="badge byes">✓</span> Supported</div>
      <div className="legend-item"><span className="badge bpt">Path Tracing</span> Full path tracing</div>
    </div>
  );
}
