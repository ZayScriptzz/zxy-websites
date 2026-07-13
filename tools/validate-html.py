#!/usr/bin/env python3
"""Structure validator for websites.html — run: python3 tools/validate-html.py
Checks tag balance, duplicate ids, dead same-page anchors."""
import sys, os
from html.parser import HTMLParser

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "websites.html")
VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}

class Check(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.ids, self.anchors, self.problems = [], {}, [], []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            if a["id"] in self.ids:
                self.problems.append(f"DUP ID: #{a['id']} (lines {self.ids[a['id']]} and {self.getpos()[0]})")
            self.ids[a["id"]] = self.getpos()[0]
        if tag == "a" and a.get("href", "").startswith("#") and len(a["href"]) > 1:
            self.anchors.append((a["href"][1:], self.getpos()[0]))
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))
    def handle_endtag(self, tag):
        if tag in VOID: return
        if not self.stack:
            self.problems.append(f"UNMATCHED </{tag}> at line {self.getpos()[0]}"); return
        open_tag, line = self.stack.pop()
        if open_tag != tag:
            self.problems.append(f"MISMATCH: <{open_tag}> (line {line}) closed by </{tag}> (line {self.getpos()[0]})")

c = Check()
c.feed(open(PATH, encoding="utf-8").read())
for tag, line in c.stack:
    if tag != "html":
        c.problems.append(f"UNCLOSED <{tag}> from line {line}")
for target, line in c.anchors:
    if target not in c.ids:
        c.problems.append(f"DEAD ANCHOR: #{target} (line {line}) — no such id")
if c.problems:
    print("\n".join(c.problems)); sys.exit(1)
print(f"HTML OK — balanced, {len(c.ids)} unique ids, {len(c.anchors)} anchors all resolve.")
