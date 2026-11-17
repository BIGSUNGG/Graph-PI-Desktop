/* 연결선 애니메이션 판정 규칙. 브라우저(window.MOTION)와 node(require) 양쪽에서 쓴다. */
(function (root) {
  function liveEdge(a, b) { return a === "running" && b === "running"; }
  function allLive(list) { return list.length > 0 && list.every(Boolean); }
  var api = { liveEdge: liveEdge, allLive: allLive };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MOTION = api;
})(this);
