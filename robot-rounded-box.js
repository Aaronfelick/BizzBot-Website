// ============================================================================
// Classic-script stand-in for THREE.RoundedBoxGeometry.
//
// Three.js only ever shipped RoundedBoxGeometry as an ES module addon
// (examples/jsm/geometries/RoundedBoxGeometry.js) — never as a plain classic
// script. robot.js is deliberately non-module (so it still works when
// index.html is opened straight from disk), so we build an equivalent here
// with a simple, well-known technique: take a subdivided BoxGeometry, clamp
// each vertex to an inset "core" box, then push it back out along the
// direction it was clamped from by `radius`. That rounds every edge and
// corner without needing ES modules at all.
//
// Must load after three.min.js and before robot.js.
// ============================================================================

(function () {
  if (typeof THREE === 'undefined') return;

  function RoundedBoxGeometry(width, height, depth, segments, radius) {
    width = width || 1;
    height = height || 1;
    depth = depth || 1;
    segments = Math.max(1, Math.floor(segments) || 1);

    const halfW = width / 2, halfH = height / 2, halfD = depth / 2;
    const r = Math.max(0, Math.min(radius || 0, halfW, halfH, halfD));
    const innerW = halfW - r, innerH = halfH - r, innerD = halfD - r;

    const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);

      const cx = Math.max(-innerW, Math.min(innerW, v.x));
      const cy = Math.max(-innerH, Math.min(innerH, v.y));
      const cz = Math.max(-innerD, Math.min(innerD, v.z));

      const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (len > 1e-6 && r > 0) {
        const scale = r / len;
        pos.setXYZ(i, cx + dx * scale, cy + dy * scale, cz + dz * scale);
      }
    }

    geo.computeVertexNormals();
    return geo;
  }

  THREE.RoundedBoxGeometry = RoundedBoxGeometry;
})();
