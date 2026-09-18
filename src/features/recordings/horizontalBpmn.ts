// Re-layout the API's BPMN DI without changing activities, conditions or connections.
export function horizontalBpmn(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("BPMN inválido");
  const elements = (name: string) =>
    Array.from(document.getElementsByTagNameNS("*", name));
  const bounds = (shape: Element) =>
    shape.getElementsByTagNameNS("*", "Bounds")[0];
  const shapes = elements("BPMNShape");
  const semantic = new Map(
    Array.from(document.getElementsByTagName("*"))
      .filter((element) => element.hasAttribute("id"))
      .map((element) => [element.getAttribute("id")!, element]),
  );
  const lanes = shapes.filter((shape) =>
    ["participant", "lane"].includes(
      semantic.get(shape.getAttribute("bpmnElement")!)?.localName || "",
    ),
  );
  const nodes = shapes
    .filter((shape) => !lanes.includes(shape))
    .sort(
      (a, b) =>
        Number(bounds(a)?.getAttribute("y")) -
        Number(bounds(b)?.getAttribute("y")),
    );
  const positions = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >();
  let nextX = 140;
  function rect(element: Element, x: number, y: number, w: number, h: number) {
    for (const [name, value] of Object.entries({ x, y, width: w, height: h }))
      element.setAttribute(name, String(value));
  }
  nodes.forEach((shape) => {
    const id = shape.getAttribute("bpmnElement")!;
    const type = semantic.get(id)?.localName || "";
    const event = type.endsWith("Event"),
      decision = type.endsWith("Gateway");
    const w = event ? 42 : decision ? 58 : 220;
    const label = semantic.get(id)?.getAttribute("name") || "";
    const h = event
      ? 42
      : decision
        ? 58
        : Math.max(100, Math.ceil(label.length / 25) * 19 + 32);
    const y = 180 - h / 2;
    rect(bounds(shape), nextX, y, w, h);
    positions.set(id, { x: nextX, y, w, h });
    const labelBounds = shape
      .getElementsByTagNameNS("*", "BPMNLabel")[0]
      ?.getElementsByTagNameNS("*", "Bounds")[0];
    if (labelBounds) rect(labelBounds, nextX - 35, y + h + 10, w + 70, 45);
    shape.setAttributeNS(
      "http://bpmn.io/schema/bpmn/biocolor/1.0",
      "bioc:fill",
      decision
        ? "#fff0c2"
        : type === "endEvent"
          ? "#e9dcff"
          : event
            ? "#cff4df"
            : "#e0f1ff",
    );
    shape.setAttributeNS(
      "http://bpmn.io/schema/bpmn/biocolor/1.0",
      "bioc:stroke",
      decision ? "#926215" : event ? "#34715a" : "#376c98",
    );
    nextX += w + 100;
  });
  let branches = 0;
  elements("BPMNEdge").forEach((edge) => {
    const flow = semantic.get(edge.getAttribute("bpmnElement")!);
    const source = positions.get(flow?.getAttribute("sourceRef") || "");
    const target = positions.get(flow?.getAttribute("targetRef") || "");
    if (!source || !target) return;
    const branch = !!flow?.getAttribute("name") || target.x <= source.x;
    const row = branch ? 310 + branches++ * 70 : 180;
    const points = branch
      ? [
          [source.x + source.w / 2, source.y + source.h],
          [source.x + source.w / 2, row],
          [target.x + target.w / 2, row],
          [target.x + target.w / 2, target.y + target.h],
        ]
      : [
          [source.x + source.w, 180],
          [target.x, 180],
        ];
    Array.from(edge.getElementsByTagNameNS("*", "waypoint")).forEach((point) =>
      point.remove(),
    );
    points.forEach(([x, y]) => {
      const point = document.createElementNS(
        "http://www.omg.org/spec/DD/20100524/DI",
        "di:waypoint",
      );
      point.setAttribute("x", String(x));
      point.setAttribute("y", String(y));
      edge.insertBefore(
        point,
        edge.getElementsByTagNameNS("*", "BPMNLabel")[0] || null,
      );
    });
    const label = edge.getElementsByTagNameNS("*", "Bounds")[0];
    if (label) rect(label, (source.x + target.x) / 2, row + 8, 180, 45);
  });
  lanes.forEach((shape, index) => {
    rect(
      bounds(shape),
      40 + index * 30,
      40,
      nextX - 20 - index * 30,
      320 + branches * 70,
    );
    shape.setAttribute("isHorizontal", "true");
  });
  return new XMLSerializer().serializeToString(document);
}
