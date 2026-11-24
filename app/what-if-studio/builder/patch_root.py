"""Them hai composition Builder va BuilderBoard vao src/Root.tsx (chay nhieu lan khong sao)."""
import io
import os
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "Root.tsx")
s = io.open(root, encoding="utf-8").read()
if "BuilderMain" in s:
    print("Root.tsx da co Shot Builder.")
    sys.exit(0)
imp = "import { BuilderMain, BuilderBoard, builderDefaults, builderMeta, boardMeta } from './builder/Builder';\n"
anchor = "import { CastSheet } from './CastSheet';\n"
comp_anchor = '      <Composition id="Cast"'
if anchor not in s or comp_anchor not in s:
    print("Khong nhan ra cau truc Root.tsx, hay gui file nay cho nguoi ho tro.")
    sys.exit(1)
s = s.replace(anchor, anchor + imp)
comps = (
    '      <Composition id="Builder" component={BuilderMain} durationInFrames={1} defaultProps={builderDefaults} calculateMetadata={builderMeta} {...common} />\n'
    '      <Composition id="BuilderBoard" component={BuilderBoard} durationInFrames={1} defaultProps={builderDefaults} calculateMetadata={boardMeta} {...common} />\n'
)
s = s.replace(comp_anchor, comps + comp_anchor)
io.open(root, "w", encoding="utf-8", newline="\n").write(s)
print("Da them Shot Builder vao Root.tsx.")
