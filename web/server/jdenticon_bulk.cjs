"use strict";

// Renders Jdenticons for many values with a single Node process, since
// starting Node once per avatar dominates the cost of creating users in
// bulk. Reads one value per line from stdin and prints one line per value,
// holding a base64-encoded PNG for each size given as an argument.

const fs = require("node:fs");

const {toPng} = require("jdenticon");

// Keep in sync with the options passed to the Jdenticon CLI in
// generate_avatar_jdenticon in zerver/lib/avatar.py.
const config = {
    padding: 0,
    lightness: {color: [0.3, 0.7], grayscale: [0.3, 0.7]},
};

const sizes = process.argv.slice(2).map(Number);
const values = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
for (const value of values) {
    console.info(sizes.map((size) => toPng(value, size, config).toString("base64")).join(" "));
}
