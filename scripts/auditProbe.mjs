// One-shot diagnostic probe for the "tray Gooncord, app vanilla" issue.
// Adds FILE markers (console never reaches renderer_js.log for preload).
// Backs up, patches, syntax-checks. Restores automatically on failure.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const DIST = "dist/desktop/preload.js";
const BAK = "dist/desktop/preload.js.probebak";
const RES = process.env.LOCALAPPDATA + "\\Discord\\app-1.0.9258\\resources\\app.asar\\index.js";
const RESBAK = RES + ".probebak";

const OLD_CATCH = `.catch(r=>console.error("[Gooncord] Renderer eval failed:",r?.message??r,r?.stack?.slice(0,2e3)??""));`;
const NEW_CATCH = `.then(()=>{try{require("fs").appendFileSync(require("os").tmpdir()+"/goon_marker.log",new Date().toISOString()+" EVAL OK\\n")}catch(x){}try{setTimeout(()=>{try{i.webFrame.executeJavaScript("typeof Vencord").then(v=>{try{require("fs").appendFileSync(require("os").tmpdir()+"/goon_marker.log",new Date().toISOString()+" PAGE Vencord="+v+" url="+location.href.slice(0,60)+"\\n")}catch(x){}})}catch(x){}},8000)}catch(x){}},r=>{try{require("fs").appendFileSync(require("os").tmpdir()+"/goon_marker.log",new Date().toISOString()+" EVAL FAIL "+String((r&&r.message)||r).slice(0,500)+"\\n")}catch(x){}console.error("[Gooncord] Renderer eval failed:",r?.message??r,r?.stack?.slice(0,2e3)??"")});`;
const ENTRY = `;try{require("fs").appendFileSync(require("os").tmpdir()+"/goon_marker.log",new Date().toISOString()+" PRELOAD "+location.protocol+" "+location.href.slice(0,60)+" dp="+(process.env.DISCORD_PRELOAD?"yes":"NO")+"\\n")}catch(x){}`;
const SHIM_MARK = `try{require("fs").appendFileSync(require("os").tmpdir()+"/goon_marker.log",new Date().toISOString()+" SHIM\\n")}catch(x){}\n`;

function check(f) {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
}

let c = readFileSync(DIST, "utf-8");
if (!c.includes(OLD_CATCH)) {
    console.error("PROBE ABORT: expected catch block not found in dist preload. Rebuild first.");
    process.exit(1);
}
copyFileSync(DIST, BAK);
copyFileSync(RES, RESBAK);

try {
    writeFileSync(DIST, c.replace(OLD_CATCH, NEW_CATCH) + ENTRY);
    check(DIST);
    const shim = readFileSync(RES, "utf-8");
    writeFileSync(RES, SHIM_MARK + shim);
    check(RES);
    try { require("fs").rmSync(join(tmpdir(), "goon_marker.log"), { force: true }); } catch {}
    console.log("PROBE ARMED. Marker: " + join(tmpdir(), "goon_marker.log"));
} catch (e) {
    console.error("PROBE FAILED, restoring:", String(e).slice(0, 300));
    copyFileSync(BAK, DIST);
    copyFileSync(RESBAK, RES);
    process.exit(1);
}
