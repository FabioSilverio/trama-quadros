import React, { useEffect, useRef } from "react";

const t = (x, y, text, size = 16, ink = "#34333b", font = 5) => ({
  type: "text",
  x,
  y,
  text,
  fontSize: size,
  strokeColor: ink,
  fontFamily: font,
});
const box = (x, y, w, h, color, ink, ang = 0) => ({
  type: "rectangle",
  x,
  y,
  width: w,
  height: h,
  backgroundColor: color,
  strokeColor: ink,
  angle: ang,
});
const line = (x, y, points, ink = "#44404d", arrow = false) => ({
  type: arrow ? "arrow" : "line",
  x,
  y,
  points,
  strokeColor: ink,
  endArrowhead: arrow ? "arrow" : null,
});
const oval = (x, y, w, h, fill, ink) => ({
  type: "ellipse",
  x,
  y,
  width: w,
  height: h,
  backgroundColor: fill,
  strokeColor: ink,
});
export const coverColors = {
  map: "#ebe7fc",
  palette: "#fce5d3",
  story: "#daf0e6",
  blank: "#f2f0f8",
};
export function sceneSpecs(type) {
  let shapes = [];
  if (type === "map")
    shapes = [
      line(
        104,
        51,
        [
          [0, 0],
          [42, 0],
          [64, 32],
        ],
        "#746099",
        true,
      ),
      line(
        241,
        86,
        [
          [0, 0],
          [24, -31],
          [59, -31],
        ],
        "#746099",
        true,
      ),
      line(
        100,
        136,
        [
          [0, 0],
          [36, 0],
          [65, -32],
        ],
        "#746099",
        true,
      ),
      line(
        236,
        105,
        [
          [0, 0],
          [32, 27],
          [66, 27],
        ],
        "#746099",
        true,
      ),
      box(36, 37, 87, 30, "#fff9e5", "#665638", -0.035),
      t(49, 44, "origens", 16),
      box(290, 36, 79, 32, "#e1f2e7", "#40685a", 0.04),
      t(303, 44, "repertório", 13),
      box(30, 121, 94, 32, "#fadae6", "#8d566f", 0.012),
      t(44, 129, "perguntas", 15),
      box(291, 118, 82, 31, "#fffaf4", "#716456", -0.04),
      t(307, 126, "ensaios", 15),
      oval(143, 68, 112, 54, "#c3b1f4", "#624989"),
      t(159, 83, "uma ideia", 19, "#493268"),
    ];
  if (type === "palette")
    shapes = [
      box(69, 29, 122, 123, "#fffaf2", "#655849", -0.08),
      t(85, 44, "formas", 18),
      oval(90, 71, 50, 50, "#ef8865", "#d8795b"),
      box(127, 90, 39, 38, "#6a69a6", "#6a69a6"),
      box(218, 44, 112, 98, "#fff7ee", "#746252", 0.06),
      t(233, 58, "paleta", 16),
      ...["#f08b70", "#e5ba66", "#6b9a84", "#8580ba"].map((c, i) =>
        box(231 + i * 21, 88, 19, 31, c, c),
      ),
      line(
        150,
        154,
        [
          [0, 0],
          [23, 7],
          [48, 0],
          [64, -14],
        ],
        "#8e644c",
        true,
      ),
    ];
  if (type === "story")
    shapes = [
      ...[34, 153, 272].flatMap((x, i) => [
        box(x, 51, 99, 77, "#fbfffa", "#47695f", i === 1 ? 0.025 : -0.018),
        t(x + 4, 132, ["abertura", "encontro", "desfecho"][i], 14, "#446257"),
      ]),
      oval(49, 63, 13, 13, "#e4bb67", "#637465"),
      line(
        37,
        116,
        [
          [0, 0],
          [27, -29],
          [41, -14],
          [64, -40],
          [92, -9],
        ],
        "#648779",
      ),
      oval(173, 65, 16, 17, "#f1d8b8", "#557165"),
      line(
        181,
        84,
        [
          [0, 0],
          [-10, 30],
          [13, 0],
          [4, -19],
        ],
        "#557165",
      ),
      oval(210, 71, 14, 14, "#e7c3a4", "#557165"),
      line(
        216,
        88,
        [
          [0, 0],
          [-8, 23],
          [13, 0],
          [2, -17],
        ],
        "#557165",
      ),
      line(
        279,
        117,
        [
          [0, 0],
          [25, -24],
          [43, -8],
          [67, -36],
          [84, -17],
        ],
        "#648779",
      ),
      oval(292, 65, 17, 17, "#edc16f", "#637465"),
      line(
        133,
        87,
        [
          [0, 0],
          [16, 0],
        ],
        "#668575",
        true,
      ),
      line(
        253,
        87,
        [
          [0, 0],
          [16, 0],
        ],
        "#668575",
        true,
      ),
    ];
  return shapes.map((s) => ({
    roughness: 1,
    strokeWidth: 1.5,
    fillStyle: "solid",
    ...s,
  }));
}
function inkShape(c, s) {
  c.save();
  c.translate(s.x, s.y);
  if (s.angle) {
    c.translate(s.width / 2, s.height / 2);
    c.rotate(s.angle);
    c.translate(-s.width / 2, -s.height / 2);
  }
  c.strokeStyle = s.strokeColor;
  c.fillStyle = s.backgroundColor || s.strokeColor;
  c.lineWidth = s.strokeWidth || 1.5;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  if (s.type === "text") {
    c.fillStyle = s.strokeColor;
    c.font = "italic " + s.fontSize + "px Georgia";
    c.textBaseline = "top";
    c.fillText(s.text, 0, 0);
  }
  if (s.type === "rectangle") {
    let w = s.width,
      h = s.height;
    c.moveTo(0, 1);
    c.lineTo(w * 0.65, -0.8);
    c.lineTo(w, 0);
    c.lineTo(w - 0.8, h);
    c.lineTo(w * 0.3, h + 0.7);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
    c.stroke();
  }
  if (s.type === "ellipse") {
    c.ellipse(
      s.width / 2,
      s.height / 2,
      s.width / 2,
      s.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.stroke();
  }
  if (["arrow", "line"].includes(s.type)) {
    s.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    if (s.type === "arrow") {
      const [x, y] = s.points.at(-1),
        [a, b] = s.points.at(-2);
      c.translate(x, y);
      c.rotate(Math.atan2(y - b, x - a));
      c.beginPath();
      c.moveTo(-6, -3);
      c.lineTo(0, 0);
      c.lineTo(-6, 3);
      c.stroke();
    }
  }
  c.restore();
}
function hero(c) {
  // A small arrangement of paper, a landscape study and a pencil.
  c.save();
  c.translate(75, 63);
  c.rotate(-0.16);
  c.fillStyle = "#b9a6e8";
  c.fillRect(5, 7, 165, 109);
  c.fillStyle = "#fffdfa";
  c.strokeStyle = "#51436d";
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(0, 0, 165, 109, 6);
  c.fill();
  c.stroke();
  c.fillStyle = "#dacef5";
  c.fillRect(10, 12, 145, 78);
  c.fillStyle = "#f9d88c";
  c.beginPath();
  c.arc(39, 34, 11, 0, 7);
  c.fill();
  c.fillStyle = "#a69bdc";
  c.beginPath();
  c.moveTo(10, 90);
  c.lineTo(62, 39);
  c.lineTo(112, 90);
  c.fill();
  c.fillStyle = "#7664ba";
  c.beginPath();
  c.moveTo(57, 90);
  c.lineTo(115, 39);
  c.lineTo(155, 81);
  c.lineTo(155, 90);
  c.fill();
  c.restore();
  c.save();
  c.translate(224, 94);
  c.rotate(0.13);
  c.fillStyle = "#ab8fbb";
  c.fillRect(4, 5, 94, 79);
  c.fillStyle = "#ffce7e";
  c.strokeStyle = "#725539";
  c.lineWidth = 1.8;
  c.fillRect(0, 0, 94, 79);
  c.strokeRect(0, 0, 94, 79);
  c.fillStyle = "#e5b6a3";
  c.globalAlpha = 0.85;
  c.fillRect(28, -6, 39, 13);
  c.globalAlpha = 1;
  c.strokeStyle = "#8c6a44";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(15, 28 + i * 10);
    c.bezierCurveTo(30, 26 + i * 10, 38, 32 + i * 10, 73 - i * 7, 28 + i * 10);
    c.stroke();
  }
  c.restore();
  c.save();
  c.translate(268, 22);
  c.rotate(0.69);
  c.fillStyle = "#b395ef";
  c.strokeStyle = "#4d3f68";
  c.lineWidth = 1.7;
  c.fillRect(0, 0, 12, 71);
  c.strokeRect(0, 0, 12, 71);
  c.beginPath();
  c.moveTo(0, 71);
  c.lineTo(6, 86);
  c.lineTo(12, 71);
  c.closePath();
  c.fillStyle = "#ffe2b5";
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(4, 80);
  c.lineTo(6, 86);
  c.lineTo(8, 80);
  c.fillStyle = "#392e4a";
  c.fill();
  c.restore();
  c.strokeStyle = "#8a70c8";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(18, 129);
  c.bezierCurveTo(-3, 97, 37, 92, 38, 111);
  c.bezierCurveTo(36, 129, 8, 105, 57, 75);
  c.stroke();
  inkShape(
    c,
    line(
      49,
      75,
      [
        [0, 0],
        [9, -2],
        [6, 7],
      ],
      "#8a70c8",
    ),
  );
  c.save();
  c.translate(192, 169);
  c.rotate(-0.2);
  c.fillStyle = "#7755d1";
  c.strokeStyle = "#fff";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(4, 25);
  c.lineTo(11, 17);
  c.lineTo(20, 14);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  for (const [x, y] of [
    [60, 36],
    [334, 76],
    [144, 187],
  ]) {
    c.strokeStyle = "#a68ccf";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x - 4, y);
    c.lineTo(x + 4, y);
    c.moveTo(x, y - 4);
    c.lineTo(x, y + 4);
    c.stroke();
  }
}
export function Art({ type }) {
  const ref = useRef(null),
    isHero = type === "hero",
    w = isHero ? 360 : 400,
    h = isHero ? 205 : 184;
  useEffect(() => {
    const c = ref.current.getContext("2d");
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, w, h);
    if (isHero) hero(c);
    else sceneSpecs(type).forEach((s) => inkShape(c, s));
  }, [type]);
  return (
    <canvas
      aria-hidden="true"
      className={"art " + (isHero ? "hero-art" : "")}
      ref={ref}
      width={w * 2}
      height={h * 2}
    />
  );
}
