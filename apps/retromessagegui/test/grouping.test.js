// Unit tests for the merge logic of app.js. Run: node apps/retromessagegui/test/grouping.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const block = src.slice(src.indexOf("// <grouping>"), src.indexOf("// </grouping>"));
const lib = new Function(block + "\nreturn {msgTime, normTitle, splitTitle, msgKey, convKey, canMerge, buildGroups, safeCut, imgLen, MAX_MEMBERS, MAX_GROUP_MSGS};")();

let tests = 0;
function test(name, fn) { fn(); tests++; }
const T0 = Date.parse("2026-10-18T10:00:00Z");
let nextId = 1;
// msgs given oldest first (as they arrive); returns newest first like MESSAGES
function arrive(list) {
  return list.map(([title, sec, extra]) => Object.assign({t:"add", id:nextId++, src:"WhatsApp", title:title, body:"b"+sec, date:T0+sec*1000, new:true}, extra||{})).reverse();
}
const ids = r => r.groups.map(g => g.msgs.map(m => m.body).join(","));

test("normTitle removes WhatsApp counts", () => {
  assert.strictEqual(lib.normTitle("Al"), "Al");
  assert.strictEqual(lib.normTitle("Al (2 messages)"), "Al");
  assert.strictEqual(lib.normTitle("Family (3 messages): Al"), "Family: Al");
  assert.strictEqual(lib.normTitle("Family (3 nouveaux messages): Al (2 messages)"), "Family: Al");
  assert.strictEqual(lib.normTitle("Team (2026)"), "Team (2026)");
  assert.strictEqual(lib.normTitle("Project (2FA)"), "Project (2FA)");
  assert.strictEqual(lib.normTitle("Al (2)"), "Al (2)");
  assert.strictEqual(lib.normTitle(undefined), "");
  assert.strictEqual(lib.normTitle("François (12 messages)"), "François");
});

test("splitTitle only splits WhatsApp group titles", () => {
  assert.deepStrictEqual(lib.splitTitle({src:"WhatsApp", title:"Family (3 messages): Al"}), {sender:"Al", chat:"Family"});
  assert.deepStrictEqual(lib.splitTitle({src:"WhatsApp", title:"Al (2 messages)"}), {sender:"Al"});
  assert.deepStrictEqual(lib.splitTitle({src:"Calendar", title:"Reminder: Submit report"}), {sender:"Reminder: Submit report"});
  assert.deepStrictEqual(lib.splitTitle({src:"WhatsApp", title:"A: B: Bob"}), {sender:"Bob", chat:"A: B"});
});

test("msgTime handles numbers, ISO strings and bad values", () => {
  assert.strictEqual(lib.msgTime({date:T0}), T0);
  assert.strictEqual(lib.msgTime({date:"2026-10-18T10:00:00Z"}), T0);
  assert.strictEqual(lib.msgTime({date:"garbage"}), undefined);
  assert.strictEqual(lib.msgTime({}), undefined);
});

test("2-letter name with WhatsApp counts is merged", () => {
  const r = lib.buildGroups(arrive([["Al",0],["Al (2 messages)",5],["Al (3 messages)",12]]), 30);
  assert.deepStrictEqual(ids(r), ["b12,b5,b0"]);
});

test("gap rule chains, and splits when gap is too long", () => {
  const r = lib.buildGroups(arrive([["Bob",0],["Bob",25],["Bob",50],["Bob",200],["Bob",210]]), 30);
  assert.deepStrictEqual(ids(r), ["b210,b200", "b50,b25,b0"]);
});

test("ISO dates merge too", () => {
  const msgs = arrive([["Bob",0],["Bob",10]]);
  msgs.forEach(m => m.date = new Date(m.date).toISOString());
  assert.deepStrictEqual(ids(lib.buildGroups(msgs, 30)), ["b10,b0"]);
});

test("no merge when out of order, no date or merging off", () => {
  let msgs = arrive([["Bob",10],["Bob",0]]); // newer one in list has older date
  assert.strictEqual(lib.buildGroups(msgs, 30).groups.length, 2);
  msgs = arrive([["Bob",0],["Bob",5]]); delete msgs[1].date;
  assert.strictEqual(lib.buildGroups(msgs, 30).groups.length, 2);
  msgs = arrive([["Bob",0],["Bob",5]]);
  assert.strictEqual(lib.buildGroups(msgs, 0).groups.length, 2);
  msgs = arrive([["Bob",0],["Bob",5]]); msgs.forEach(m => m.date = "garbage");
  assert.strictEqual(lib.buildGroups(msgs, 30).groups.length, 2);
});

test("equal timestamps merge", () => {
  assert.strictEqual(lib.buildGroups(arrive([["Bob",0],["Bob",0]]), 30).groups.length, 1);
});

test("other chat in between does not break a burst", () => {
  const r = lib.buildGroups(arrive([["Al",0],["Bob",2],["Al (2 messages)",4]]), 30);
  assert.deepStrictEqual(ids(r), ["b4,b0", "b2"]);
});

test("other sender in the same group chat breaks the burst", () => {
  const r = lib.buildGroups(arrive([["Fam: Al",0],["Fam (2 messages): Bob",2],["Fam (3 messages): Al",4]]), 30);
  assert.deepStrictEqual(ids(r), ["b4", "b2", "b0"]);
});

test("an undated message of another sender also breaks the burst", () => {
  const msgs = arrive([["Fam: Al",0],["Fam: Bob",2],["Fam: Al",4]]);
  delete msgs[1].date;
  assert.deepStrictEqual(ids(lib.buildGroups(msgs, 30)), ["b4", "b2", "b0"]);
});

test("same sender in two group chats is not merged", () => {
  const r = lib.buildGroups(arrive([["Fam: Al",0],["Work: Al",2]]), 30);
  assert.strictEqual(r.groups.length, 2);
});

test("different apps are not merged", () => {
  const r = lib.buildGroups(arrive([["Al",0],["Al",2,{src:"Signal"}]]), 30);
  assert.strictEqual(r.groups.length, 2);
});

test("music, nav, calls and alarms are not merged", () => {
  const r = lib.buildGroups(arrive([["Bob",0,{id:"call"}],["Bob",1,{id:"call"}],["x",2,{src:"Alarm clock"}],["x",3,{src:"alarm clock"}]]), 30);
  assert.strictEqual(r.groups.length, 4);
});

test("group size is capped", () => {
  const list = []; for (let i=0;i<25;i++) list.push(["Bob", i]);
  const r = lib.buildGroups(arrive(list), 30);
  assert.deepStrictEqual(r.groups.map(g => g.msgs.length), [lib.MAX_MEMBERS, lib.MAX_MEMBERS, 5]);
});

test("only the newest MAX_GROUP_MSGS are grouped", () => {
  const list = []; for (let i=0;i<60;i++) list.push(["P"+i, i]);
  const msgs = arrive(list), r = lib.buildGroups(msgs, 30);
  assert.strictEqual(r.n, lib.MAX_GROUP_MSGS);
  assert.strictEqual(r.groups.length, lib.MAX_GROUP_MSGS);
});

test("removal of newest/middle/oldest member", () => {
  const msgs = arrive([["Bob",0],["Bob",10],["Bob",20]]);
  for (let k=0;k<3;k++) {
    const rest = msgs.filter((_,i) => i!==k);
    assert.strictEqual(lib.buildGroups(rest, 30).groups.length, 1, "removed "+k);
  }
  // removing the middle one makes the gap 20s: still merged with 30s, split with 15s
  assert.strictEqual(lib.buildGroups([msgs[0], msgs[2]], 15).groups.length, 2);
});

test("safeCut never cuts inside an inline image", () => {
  // 1bpp transparent 8x2 image: header w,h,bpp|128,transparent + 2 bytes
  const img = "\0" + String.fromCharCode(8, 2, 1|128, 0, 0x00, 0xFF);
  assert.strictEqual(lib.imgLen(img, 1), 6);
  const s = "ab" + img + "cd";
  assert.strictEqual(lib.safeCut(s, 2), "ab");
  assert.strictEqual(lib.safeCut(s, 4), "ab");   // would cut inside the image
  assert.strictEqual(lib.safeCut(s, 8), "ab");
  assert.strictEqual(lib.safeCut(s, 9), "ab" + img);
  assert.strictEqual(lib.safeCut(s, 10), s.substr(0,10));
  assert.strictEqual(lib.safeCut("abc", 10), "abc");
  // a zero byte inside the pixel data is not taken as a new image
  const img0 = "\0" + String.fromCharCode(16, 1, 1, 0, 0);
  assert.strictEqual(lib.safeCut("x" + img0 + "yz", 8), "x" + img0 + "y");
});

test("stress: 40 x 400 char bodies", () => {
  const list = []; for (let i=0;i<40;i++) list.push(["Bob", i]);
  const msgs = arrive(list); msgs.forEach(m => m.body = "x".repeat(400));
  const r = lib.buildGroups(msgs, 30);
  assert.strictEqual(r.groups.length, 4);
});

console.log(tests + " tests passed");
