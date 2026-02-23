
// --- Global Hook for Programmatic Value Changes ---
// This ensures that when other extensions or UI actions (PNG Info, Presets) 
// set textarea.value programmatically, we can detect it and refresh bubbles.
try {
    const proto = HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');

    // Only hook if not already hooked or if we can access the descriptor
    if (desc && desc.set && !desc.set._isPromptBubblesHook) {
        const originalSet = desc.set;
        const newSet = function (val) {
            originalSet.call(this, val);
            // If this textarea has our attached refresh callback, trigger it.
            if (this.forceRefreshBubbles) {
                this.forceRefreshBubbles(val);
            }
        };
        newSet._isPromptBubblesHook = true;

        Object.defineProperty(proto, 'value', {
            get: desc.get,
            set: newSet,
            configurable: true
        });
    }
} catch (e) {
    console.error("[Prompt Bubbles] Failed to hook textarea value", e);
}
// --------------------------------------------------

onUiLoaded(async () => {
    // Configuration
    const EXTENSION_NAME = "Prompt Bubbles";
    const DEBUG = false;

    // Helper to log
    const log = (...args) => console.log(`[${EXTENSION_NAME} v5.0.0]`, ...args);
    log("Loaded");

    // State for advanced visualization
    let knownTags = new Set();
    let knownAliases = new Map(); // Alias -> Main Tag (for auto-fix)
    let isMatchDataLoaded = false;

    const defaultSettings = {
        showAllDict: false,
        includeTranslation: true,
        autoFixUnderscore: false,
        autoFixAlias: false,
        hideTranslationOnEdit: true,
        excludeTranslationOnCopy: true,
        translateLanguage: "ko"
    };
    let userSettings = { ...defaultSettings };
    function loadSettings() {
        try {
            const saved = localStorage.getItem("prompt_bubbles_settings_v3");
            if (saved) userSettings = { ...defaultSettings, ...JSON.parse(saved) };
        } catch (e) { console.error("Settings load error", e); }
    }
    loadSettings();
    function saveSettings() {
        localStorage.setItem("prompt_bubbles_settings_v3", JSON.stringify(userSettings));
    }

    async function initMatchData() {
        if (isMatchDataLoaded) return;
        try {
            const response = await fetch("/prompt_bubbles/all_tags");
            const data = await response.json();
            if (Array.isArray(data)) {
                data.forEach(item => {
                    const mainTag = item.t.toLowerCase();
                    knownTags.add(mainTag);
                    if (item.a) {
                        item.a.split(",").forEach(alias => {
                            const aTrim = alias.trim().toLowerCase();
                            if (aTrim) knownAliases.set(aTrim, mainTag);
                        });
                    }
                });
            }
            isMatchDataLoaded = true;
            console.log(`[Prompt Bubbles] Loaded tags: ${knownTags.size}, Aliases: ${knownAliases.size}`);
            const containers = document.querySelectorAll(".prompt-bubble-container");
            containers.forEach(c => c.updateTextarea && c.updateTextarea(true));
        } catch (e) {
            console.error("Failed to load match data", e);
        }
    }
    // Load after a slight delay or immediately
    setTimeout(initMatchData, 1000);

    // Wait for elements to be fully rendered

    // -------------------------------------------------------------------------
    // Main Initialization Logic (Per Tab)
    // -------------------------------------------------------------------------

    function setupTab(tabName) {
        const promptId = `${tabName}_prompt`;
        const negPromptId = `${tabName}_neg_prompt`;

        const promptTextarea = document.querySelector(`#${promptId} textarea`);
        const negPromptTextarea = document.querySelector(`#${negPromptId} textarea`);

        if (!promptTextarea || !negPromptTextarea) {
            // It's possible img2img or txt2img is not active/present in some custom UIs
            // console.warn(`${EXTENSION_NAME}: Could not find textareas for ${tabName}.`);
            return;
        }

        // Attempt to clear existing bubbles for this tab (reload support)
        // Note: The global clear at start might have handled this, but good to be safe if calling setupTab dynamically
        const parentP = promptTextarea.parentElement;
        const parentN = negPromptTextarea.parentElement;
        if (parentP) parentP.querySelectorAll('.prompt-bubble-container, .prompt-bubbles-search-container').forEach(e => e.remove());
        if (parentN) parentN.querySelectorAll('.prompt-bubble-container').forEach(e => e.remove());

        promptTextarea.style.display = '';
        negPromptTextarea.style.display = '';


        // -------------------------------------------------------------------------
        // Dictionary & State
        // -------------------------------------------------------------------------
        let dictionary = {};
        const dictDataEl = document.getElementById('prompt_bubbles_dict_data');
        if (dictDataEl && dictDataEl.dataset.dictionary) {
            try { dictionary = JSON.parse(dictDataEl.dataset.dictionary); }
            catch (e) { console.error("Failed to parse dictionary data", e); }
        }

        // -------------------------------------------------------------------------
        // Context Menu Logic
        // -------------------------------------------------------------------------
        function createContextMenu() {
            const menu = document.createElement("div");
            menu.className = "prompt-bubble-context-menu";
            // ... (styles) ...
            Object.assign(menu.style, {
                position: "absolute", display: "none", backgroundColor: "#fff",
                border: "1px solid #ccc", borderRadius: "4px", boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                zIndex: "10000", minWidth: "120px", padding: "4px 0"
            });
            const items = [
                { label: "수정", action: "edit" },
                { label: "복사", action: "copy" },
                { label: "사전에 추가", action: "dict" },
                { label: "부정 프롬프트로 이동", action: "neg" }, // Only show if in Pos
                { label: "프롬프트로 이동", action: "pos" }, // Only show if in Neg
                { label: "삭제", action: "delete", color: "red" }
            ];
            items.forEach(item => {
                const div = document.createElement("div");
                div.textContent = item.label;
                div.className = "context-menu-item";
                div.dataset.action = item.action;
                Object.assign(div.style, { padding: "8px 12px", cursor: "pointer", fontSize: "0.9em", color: item.color || "#333" });
                div.onmouseover = () => div.style.backgroundColor = "#eee";
                div.onmouseout = () => div.style.backgroundColor = "transparent";
                menu.appendChild(div);
            });
            document.body.appendChild(menu);
            document.addEventListener("click", () => menu.style.display = "none");
            return menu;
        }

        const contextMenu = createContextMenu();
        let currentContextBubble = null;
        let currentContextIsNegative = false;

        function showContextMenu(e, bubble, isNegative) {
            e.preventDefault(); e.stopPropagation();
            currentContextBubble = bubble; currentContextIsNegative = isNegative;
            const items = contextMenu.querySelectorAll(".context-menu-item");
            items.forEach(div => {
                if (div.dataset.action === "neg") div.style.display = isNegative ? "none" : "block";
                if (div.dataset.action === "pos") div.style.display = isNegative ? "block" : "none";
            });
            contextMenu.style.left = e.pageX + "px";
            contextMenu.style.top = e.pageY + "px";
            contextMenu.style.display = "block";
        }

        contextMenu.addEventListener("click", (e) => {
            if (!currentContextBubble) return;
            const action = e.target.dataset.action;

            // Fix: Capture container reference before any action that might remove the bubble
            const container = currentContextBubble.parentElement;

            if (action === "delete") {
                currentContextBubble.remove();
                if (container && container.updateTextarea) container.updateTextarea();
            }
            else if (action === "edit") { editBubble(currentContextBubble); }
            else if (action === "copy") {
                const bubble = currentContextBubble;
                const type = bubble.dataset.type;
                const tag = bubble.dataset.tag;
                const trans = bubble.dataset.translation;
                let val = "";

                if (type === 'dynamic' || type === 'group' || type === 'lora') val = tag;
                else if (bubble.dataset.weight) {
                    let base = trans && !userSettings.excludeTranslationOnCopy ? `${tag}@@${trans}@@` : tag;
                    if (bubble.dataset.weightValue) val = `(${base}:${bubble.dataset.weightValue})`;
                    else val = `(${base})`;
                } else {
                    val = trans && !userSettings.excludeTranslationOnCopy ? `${tag}@@${trans}@@` : tag;
                }

                navigator.clipboard.writeText(val).then(() => {
                    // Optional: visual feedback? Maybe just close menu (already handled)
                }).catch(err => {
                    console.error("Copy failed", err);
                    alert("복사에 실패했습니다.");
                });
            }
            else if (action === "dict") {
                const tag = currentContextBubble.dataset.tag;
                const trans = currentContextBubble.dataset.translation;
                if (!tag || tag === "undefined" || currentContextBubble.dataset.type === 'dynamic') {
                    alert("Cannot add complex/dynamic tag to dictionary directly."); return;
                }
                const evt = new CustomEvent("prompt-bubble-search-fill", { detail: { tag, trans } });
                document.dispatchEvent(evt);
            } else if (action === "neg") { moveToOtherArea(currentContextBubble, true); }
            else if (action === "pos") { moveToOtherArea(currentContextBubble, false); }
        });

        // Helper to start inline editing
        function editBubble(bubble) {
            // Redirect to modal editing if that's what we want, or keep inline logic if we want both/fallback?
            // User requested modal editing to REPLACE inline editing because inline was failing.
            // So we should repurpose this or call openEditModal.
            // Let's reuse openEditModal logic here to be consistent.

            // Reconstruct Current Value
            let currentValue = "";
            const type = bubble.dataset.type;
            const tag = bubble.dataset.tag;
            const translation = bubble.dataset.translation;

            if (type === 'dynamic') currentValue = tag;
            else if (bubble.dataset.weight) {
                let base = translation && !userSettings.hideTranslationOnEdit ? `${tag}@@${translation}@@` : tag;
                if (bubble.dataset.weightValue) currentValue = `(${base}:${bubble.dataset.weightValue})`;
                else currentValue = `(${base})`;
            } else {
                currentValue = translation && !userSettings.hideTranslationOnEdit ? `${tag}@@${translation}@@` : tag;
            }

            openEditModal(currentValue, (newValue) => {
                const val = newValue.trim();
                if (!val) {
                    bubble.remove();
                    if (bubble.parentElement && bubble.parentElement.updateTextarea) bubble.parentElement.updateTextarea();
                } else {
                    // We need to replace this single bubble with potentially multiple tokens (if user typed comma).
                    // But we are outside createBubbleElement here, so we don't have easy access to `createBubbleElement` directly unless we expose it?
                    // Wait, `createBubbleElement` is inside `createBubbleContainer`. 
                    // So `editBubble` (Global scope) CANNOT call `createBubbleElement`.
                    // This is a scope issue.

                    // Solution: `editBubble` should just update textual content if simple? 
                    // Or we should MOVE `editBubble` logic into the bubble's click handler inside `createBubbleElement` (which we did).
                    // The Context Menu "Edit" action calls `editBubble`.
                    // So `editBubble` needs to work.

                    // We can trigger a click on the bubble?
                    // bubble.click() might trigger the same logic if we attached the click handler.
                    bubble.click();
                }
            });
        }

        function moveToOtherArea(bubble, toNegative) {
            if (!bubble.parentElement) return;

            // 1. Capture Container
            const container = bubble.parentElement;

            // 2. Find Wrapper (Robust)
            const wrapper = container.closest('#txt2img_prompt, #txt2img_neg_prompt, #img2img_prompt, #img2img_neg_prompt');
            if (!wrapper) {
                console.warn("[Prompt Bubbles] Could not determine parent area for move.");
                return;
            }

            const wrapperId = wrapper.id;
            let prefix = "";
            if (wrapperId.startsWith("txt2img")) prefix = "txt2img";
            else if (wrapperId.startsWith("img2img")) prefix = "img2img";
            else return;

            // 3. Find Target Wrapper
            const targetWrapperId = toNegative ? `${prefix}_neg_prompt` : `${prefix}_prompt`;
            const targetWrapper = document.getElementById(targetWrapperId);
            if (!targetWrapper) return;

            // 4. Find Target Container & Linked Textarea (Explicit Reference)
            const targetContainer = targetWrapper.querySelector('.prompt-bubble-container');
            let targetTextarea = null;

            if (targetContainer && targetContainer.linkedTextarea) {
                targetTextarea = targetContainer.linkedTextarea;
            } else {
                // Fallback (unsafe)
                targetTextarea = targetWrapper.querySelector("textarea");
            }

            if (!targetTextarea) return;

            if (bubble.isMoving) return;
            bubble.isMoving = true;

            // 5. Get Text
            const tag = bubble.dataset.tag;
            const trans = bubble.dataset.translation;
            const type = bubble.dataset.type;

            let textToAdd = trans ? `${tag}@@${trans}@@` : tag;
            if (type === 'dynamic') textToAdd = tag;
            else if (bubble.dataset.weight) {
                let base = trans ? `${tag}@@${trans}@@` : tag;
                if (bubble.dataset.weightValue) textToAdd = `(${base}:${bubble.dataset.weightValue})`;
                else textToAdd = `(${base})`;
            } else {
                textToAdd = trans ? `${tag}@@${trans}@@` : tag;
            }

            // 6. Cleanup Source
            bubble.remove();
            if (container && container.updateTextarea) container.updateTextarea();

            // 7. Append to Target (Simple Text Append)
            const currentVal = targetTextarea.value;
            const valTrim = currentVal.trim();
            let separator = "";
            if (valTrim) {
                if (valTrim.endsWith(',')) separator = " ";
                else separator = ", ";
            }

            targetTextarea.value = currentVal + separator + textToAdd;

            // 8. Trigger Event
            targetTextarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        function triggerUpdate(forceRender = false) {
            if (currentContextBubble && currentContextBubble.parentElement && currentContextBubble.parentElement.updateTextarea) {
                currentContextBubble.parentElement.updateTextarea(forceRender);
            }
        }

        // -------------------------------------------------------------------------
        // Tokenizer & Parser
        // -------------------------------------------------------------------------
        function tokenize(text) {
            const tokens = [];
            let currentToken = "";
            let depthRound = 0; let depthCurly = 0; let depthSquare = 0; let depthAngle = 0;
            let inGroup = false;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const nextChar = text[i + 1] || "";

                // Group syntax !!...!! toggle
                if (char === '!' && nextChar === '!') {
                    inGroup = !inGroup;
                    currentToken += "!!";
                    i++; // Skip next !
                    continue;
                }

                if (char === '<') depthAngle++;
                else if (char === '>') depthAngle = Math.max(0, depthAngle - 1);
                if (char === '(') depthRound++;
                else if (char === ')') depthRound = Math.max(0, depthRound - 1);
                else if (char === '{') depthCurly++;
                else if (char === '}') depthCurly = Math.max(0, depthCurly - 1);
                else if (char === '[') depthSquare++;
                else if (char === ']') depthSquare = Math.max(0, depthSquare - 1);

                if (char === '@' && nextChar === '@') {
                    // Check if we are opening or closing @@
                    // If we find @@ and we're not inside one, we enter.
                    // But we need to find the NEXT @@. 
                    // Let's use a simpler toggle.
                    let lookAhead = text.substring(i + 2);
                    let closeIdx = lookAhead.indexOf('@@');
                    if (closeIdx !== -1) {
                        // Found a pair! Skip the whole thing.
                        currentToken += "@@" + lookAhead.substring(0, closeIdx + 2);
                        i += closeIdx + 3;
                        continue;
                    }
                }

                if ((char === ',' || char === '\n') && depthRound === 0 && depthCurly === 0 && depthSquare === 0 && depthAngle === 0 && !inGroup) {
                    if (currentToken.trim()) tokens.push(currentToken.trim());
                    currentToken = "";
                }
                else if (char === '<' && depthRound === 0 && depthCurly === 0 && depthSquare === 0 && depthAngle === 1 && !inGroup) {
                    if (currentToken.trim()) { tokens.push(currentToken.trim()); currentToken = ""; }
                    currentToken += char;
                }
                else if (char === '>' && depthAngle === 0 && depthRound === 0 && !inGroup) {
                    currentToken += char;
                    if (currentToken.trim()) { tokens.push(currentToken.trim()); currentToken = ""; }
                }
                else currentToken += char;
            }
            if (currentToken.trim()) tokens.push(currentToken.trim());
            return tokens;
        }
        function identifyToken(token) {
            token = token.trim();
            // Dynamic: Check if it contains { and } and they are in valid order (basic check)
            if (token.includes('{') && token.includes('}') && token.indexOf('{') < token.lastIndexOf('}')) return 'dynamic';

            // Check for attached translation to allow (weight)@@translation@@
            // We strip translation suffix temporarily to check if base is weight
            // regex: /^(.*)@@[^@]+@@$/
            const transMatch = token.match(/^(.*)@@[^@]+@@$/);
            let base = token;
            if (transMatch) {
                base = transMatch[1].trim();
            }

            if (base.startsWith('(') && base.endsWith(')')) return 'weight';
            if (base.startsWith('[') && base.endsWith(']')) return 'weight';
            if (base.startsWith('<') && base.endsWith('>')) return 'lora';
            if (base.startsWith('!!') && base.endsWith('!!')) return 'group';
            return 'plain';
        }

        function parseTag(token) {
            // v6.0.0 Change: Use @@...@@ for translation to avoid conflict with weakening syntax [tag]
            // Reverted dual syntax support as per user request.
            const match = token.match(/^(.*)@@([^@]+)@@$/);
            if (match) {
                const base = match[1].trim();
                const content = match[2];
                return { text: base, translation: content };
            }
            return { text: token, translation: "" };
        }

        // -------------------------------------------------------------------------
        // Settings & Personal Dictionary Logic
        // -------------------------------------------------------------------------

        function createSettingsPanel() {
            const overlay = document.createElement("div");
            overlay.className = "prompt-bubbles-settings-overlay";
            Object.assign(overlay.style, {
                position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
                backgroundColor: "rgba(0,0,0,0.5)", zIndex: "9999", display: "none",
                justifyContent: "center", alignItems: "center"
            });

            const modal = document.createElement("div");
            modal.className = "prompt-bubbles-settings-modal";
            Object.assign(modal.style, {
                backgroundColor: "var(--background-fill-primary, #fff)",
                padding: "20px", borderRadius: "8px", width: "300px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)", position: "relative"
            });

            const title = document.createElement("h3");
            title.textContent = "Prompt Bubbles Settings";
            title.style.marginTop = "0";

            const closeBtn = document.createElement("span");
            closeBtn.textContent = "×";
            Object.assign(closeBtn.style, {
                position: "absolute", top: "10px", right: "15px", cursor: "pointer", fontSize: "24px", fontWeight: "bold"
            });
            closeBtn.onclick = () => overlay.style.display = "none";

            const content = document.createElement("div");
            content.style.display = "flex";
            content.style.flexDirection = "column";
            content.style.gap = "10px";

            // Option 1: Show All Dictionary Items
            const opt1 = document.createElement("label");
            opt1.style.display = "flex"; opt1.style.alignItems = "center"; opt1.style.gap = "8px";
            const check1 = document.createElement("input");
            check1.type = "checkbox";
            check1.checked = userSettings.showAllDict;
            check1.onchange = (e) => { userSettings.showAllDict = e.target.checked; saveSettings(); };
            opt1.appendChild(check1);
            opt1.appendChild(document.createTextNode("개인 사전에 등록된 모든 태그 표시"));

            // Option 2: Include Translation on Insert
            const opt2 = document.createElement("label");
            opt2.style.display = "flex"; opt2.style.alignItems = "center"; opt2.style.gap = "8px";
            const check2 = document.createElement("input");
            check2.type = "checkbox";
            check2.checked = userSettings.includeTranslation;
            check2.onchange = (e) => { userSettings.includeTranslation = e.target.checked; saveSettings(); };
            opt2.appendChild(check2);
            opt2.appendChild(document.createTextNode("사전에서 삽입 시 번역 포함"));

            // Option 4: Auto-fix Underscore
            const opt4 = document.createElement("label");
            opt4.style.display = "flex"; opt4.style.alignItems = "center"; opt4.style.gap = "8px";
            const check4 = document.createElement("input");
            check4.type = "checkbox";
            check4.checked = userSettings.autoFixUnderscore;
            check4.onchange = (e) => { userSettings.autoFixUnderscore = e.target.checked; saveSettings(); };
            opt4.appendChild(check4);
            opt4.appendChild(document.createTextNode("언더바(_) 자동 수정 (노란색 -> 파란색)"));

            // Option 5: Auto-fix Alias
            const opt5 = document.createElement("label");
            opt5.style.display = "flex"; opt5.style.alignItems = "center"; opt5.style.gap = "8px";
            const check5 = document.createElement("input");
            check5.type = "checkbox";
            check5.checked = userSettings.autoFixAlias;
            check5.onchange = (e) => { userSettings.autoFixAlias = e.target.checked; saveSettings(); };
            opt5.appendChild(check5);
            opt5.appendChild(document.createTextNode("에일리어스 자동 수정 (보라색 -> 파란색)"));

            // Option 6: Hide translation on Edit
            const opt6 = document.createElement("label");
            opt6.style.display = "flex"; opt6.style.alignItems = "center"; opt6.style.gap = "8px";
            const check6 = document.createElement("input");
            check6.type = "checkbox";
            check6.checked = userSettings.hideTranslationOnEdit;
            check6.onchange = (e) => { userSettings.hideTranslationOnEdit = e.target.checked; saveSettings(); };
            opt6.appendChild(check6);
            opt6.appendChild(document.createTextNode("수정 시 번역 숨기기 (기본: 숨김)"));

            // Option 7: Exclude translation on Copy
            const opt7 = document.createElement("label");
            opt7.style.display = "flex"; opt7.style.alignItems = "center"; opt7.style.gap = "8px";
            const check7 = document.createElement("input");
            check7.type = "checkbox";
            check7.checked = userSettings.excludeTranslationOnCopy;
            check7.onchange = (e) => { userSettings.excludeTranslationOnCopy = e.target.checked; saveSettings(); };
            opt7.appendChild(check7);
            opt7.appendChild(document.createTextNode("복사 시 번역 제외 (기본: 제외)"));

            content.appendChild(opt1);
            content.appendChild(opt2);
            content.appendChild(opt4);
            content.appendChild(opt5);
            content.appendChild(opt6);
            content.appendChild(opt7);

            // Option 8: Translation Language
            const opt8 = document.createElement("div");
            opt8.style.display = "flex"; opt8.style.alignItems = "center"; opt8.style.gap = "8px";
            const langLabel = document.createElement("span");
            langLabel.textContent = "번역 언어:";
            const langSelect = document.createElement("select");
            const languages = [
                { val: "ko", label: "Korean (ko)" },
                { val: "ja", label: "Japanese (ja)" },
                { val: "en", label: "English (en)" },
                { val: "zh-CN", label: "Chinese (zh-CN)" },
                { val: "zh-TW", label: "Chinese (zh-TW)" },
                { val: "fr", label: "French (fr)" },
                { val: "de", label: "German (de)" },
                { val: "es", label: "Spanish (es)" }
            ];
            languages.forEach(l => {
                const opt = document.createElement("option");
                opt.value = l.val; opt.textContent = l.label;
                if (userSettings.translateLanguage === l.val) opt.selected = true;
                langSelect.appendChild(opt);
            });
            langSelect.onchange = (e) => { userSettings.translateLanguage = e.target.checked; saveSettings(); };
            // Fix: langSelect.onchange had a bug in the line above, correcting it
            langSelect.onchange = (e) => { userSettings.translateLanguage = e.target.value; saveSettings(); };

            opt8.appendChild(langLabel);
            opt8.appendChild(langSelect);
            content.appendChild(opt8);

            // Option 3: Reload Dictionary from JSON
            const reloadBtn = document.createElement("button");
            reloadBtn.textContent = "JSON 파일에서 사전 새로고침";
            reloadBtn.className = "prompt-bubbles-translate-btn";
            reloadBtn.style.marginTop = "10px";
            reloadBtn.style.backgroundColor = "#eab308"; // Yellow/Orange
            reloadBtn.onclick = async () => {
                reloadBtn.textContent = "새로고침 중...";
                reloadBtn.disabled = true;
                try {
                    const response = await fetch("/prompt_bubbles/reload_dict", { method: "POST" });
                    const result = await response.json();
                    if (result.success && result.dictionary) {
                        dictionary = result.dictionary; // Update global dictionary
                        reloadBtn.textContent = "새로고침 완료!";
                        setTimeout(() => {
                            reloadBtn.textContent = "JSON 파일에서 사전 새로고침";
                            reloadBtn.disabled = false;
                        }, 1500);
                    } else {
                        alert("새로고침 실패: " + (result.error || "알 수 없는 오류"));
                        reloadBtn.textContent = "오류 발생";
                        setTimeout(() => { reloadBtn.textContent = "JSON 파일에서 사전 새로고침"; reloadBtn.disabled = false; }, 1500);
                    }
                } catch (e) {
                    console.error(e);
                    alert("새로고침 요청 실패");
                    reloadBtn.textContent = "오류 발생";
                    setTimeout(() => { reloadBtn.textContent = "JSON 파일에서 사전 새로고침"; reloadBtn.disabled = false; }, 1500);
                }
            };
            content.appendChild(reloadBtn);

            // --- NEW: Reload Tags from CSV ---
            const reloadTagsBtn = document.createElement("button");
            reloadTagsBtn.textContent = "CSV 태그 파일 새로고침";
            reloadTagsBtn.className = "prompt-bubbles-translate-btn";
            reloadTagsBtn.style.marginTop = "6px";
            reloadTagsBtn.style.backgroundColor = "#3b82f6"; // Blue
            reloadTagsBtn.onclick = async () => {
                reloadTagsBtn.textContent = "태그 새로고침 중...";
                reloadTagsBtn.disabled = true;
                try {
                    const response = await fetch("/prompt_bubbles/reload_tags", { method: "POST" });
                    const result = await response.json();
                    if (result.success) {
                        reloadTagsBtn.textContent = `완료! 총 ${result.count}개 로드됨`;
                        setTimeout(() => {
                            reloadTagsBtn.textContent = "CSV 태그 파일 새로고침";
                            reloadTagsBtn.disabled = false;
                        }, 2000);
                    } else {
                        alert("태그 로드 실패: " + result.error);
                        reloadTagsBtn.textContent = "오류 발생";
                        setTimeout(() => { reloadTagsBtn.textContent = "CSV 태그 파일 새로고침"; reloadTagsBtn.disabled = false; }, 1500);
                    }
                } catch (e) {
                    console.error(e);
                    alert("태그 로드 요청 실패");
                    reloadTagsBtn.textContent = "오류 발생";
                    setTimeout(() => { reloadTagsBtn.textContent = "CSV 태그 파일 새로고침"; reloadTagsBtn.disabled = false; }, 1500);
                }
            };
            content.appendChild(reloadTagsBtn);

            // --- v5.7.0 Personal Dictionary Editor ---
            const dictEditBtn = document.createElement("button");
            dictEditBtn.textContent = "📖 개인 사전 편집";
            dictEditBtn.className = "prompt-bubbles-manual-btn";
            dictEditBtn.style.marginTop = "10px";
            dictEditBtn.style.backgroundColor = "#8b5cf6"; // Violet

            dictEditBtn.onclick = () => {
                // Close settings modal first? Or open on top?
                // Let's open the editor modal.
                createDictionaryEditorModal();
            };
            content.appendChild(dictEditBtn);

            // --- v5.6.0 User Manual ---
            const manualBtn = document.createElement("button");
            manualBtn.textContent = "🖱️ 사용 매뉴얼 보기";
            manualBtn.className = "prompt-bubbles-manual-btn";
            manualBtn.style.marginTop = "10px";

            const manualContent = document.createElement("div");
            manualContent.className = "prompt-bubbles-manual-content";
            manualContent.style.display = "none";
            manualContent.innerHTML = `
            <p style="font-size: 0.9em; line-height: 1.4; color: var(--body-text-color, #444); margin-bottom: 12px; border-left: 3px solid #3b82f6; padding-left: 8px;">
                이 도구는 프롬프트 태그를 버블 형태로 시각화하여, 편집·정렬·관리를 쉽게 할 수 있도록 도와줍니다.<br>
                또한 프롬프트 번역 기능과 개인 사전 기능을 통해 태그 관리를 더 편하게 할 수 있습니다.<br>
                다른 기능으로 입력된 프롬프트 텍스트가 보이지 않거나, 버블로 변하지 않는 대부분의 문제는 새로고침을 사용바랍니다.
            </p>
            <div class="manual-section">
                <h4>🖱️ 기본 조작</h4>
                <ul>
                    <li><strong>편집</strong>: 버블 클릭 → 수정</li>
                    <li><strong>이동</strong>: 버블 우클릭 → 프롬프트 ↔ 부정 프롬프트</li>
                    <li><strong>정렬</strong>: 드래그 & 드롭으로 순서 변경</li>
                </ul>
            </div>
            <div class="manual-section">
                <h4>📚 개인 사전</h4>
                <ul>
                    <li>선호하는 태그를 저장할 수 있습니다.</li>
                    <li>번역이 등록된 태그는 번역어로도 검색 가능 (영어[번역] 형태)</li>
                    <li>Pref로 태그 선호도를 지정할 수 있습니다.</li>
                    <li>json 파일(\`prompt_bubbles_dict.json\`)을 통해 직접 편집 가능</li>
                </ul>
            </div>
            <div class="manual-section">
                <h4>🎨 버블 테두리 색상</h4>
                <ul>
                    <li><span style="color: #3b82f6;">🔵</span> <strong>표준 태그</strong>: 사전에 등록된 정확한 태그</li>
                    <li><span style="color: #eab308;">🟡</span> <strong>언더바(_) 태그</strong>: 언더바가 스페이스로 입력된 태그</li>
                    <li><span style="color: #a855f7;">🟣</span> <strong>에일리어스/LoRA</strong>: 유사어 또는 로라 태그</li>
                    <li><span style="color: #ef4444;">🔴</span> <strong>중복 태그</strong>: 동일 태그가 여러 번 들어간 상태</li>
                </ul>
            </div>
            <div class="manual-section">
                <h4>⚙️ 설정</h4>
                <ul>
                    <li><strong>모든 목록 보기</strong>: 사전 등록 태그 목록을 바로 표시</li>
                    <li><strong>삽입 시 번역 포함</strong>: 원문 혹은 원문[번역] 선택</li>
                    <li><strong>자동 수정</strong>: 언더바/유사어를 표준 태그로 자동 변환</li>
                </ul>
            </div>
        `;

            manualBtn.onclick = () => {
                const isHidden = manualContent.style.display === "none";
                manualContent.style.display = isHidden ? "block" : "none";
                manualBtn.textContent = isHidden ? "🔼 매뉴얼 접기" : "🖱️ 사용 매뉴얼 보기";
                // Adjust modal width if needed, but flex should handle it
            };

            content.appendChild(manualBtn);
            content.appendChild(manualContent);

            modal.appendChild(closeBtn);
            modal.appendChild(title);
            modal.appendChild(content);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            return { overlay, check1, check2 };
        }

        const { overlay: settingsOverlay, check1: settingsCheckShowAll } = createSettingsPanel();

        // -------------------------------------------------------------------------
        // Edit Modal Creation
        // -------------------------------------------------------------------------
        function createEditModal() {
            const overlay = document.createElement("div");
            overlay.className = "prompt-bubbles-edit-overlay";
            Object.assign(overlay.style, {
                position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
                backgroundColor: "rgba(0,0,0,0.5)", zIndex: "9999", display: "none",
                justifyContent: "center", alignItems: "center"
            });

            const modal = document.createElement("div");
            modal.className = "prompt-bubbles-edit-modal";
            Object.assign(modal.style, {
                backgroundColor: "var(--background-fill-primary, #fff)",
                padding: "20px", borderRadius: "8px", width: "450px", // Slightly wider
                maxWidth: "90%",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)", position: "relative",
                display: "flex", flexDirection: "column", gap: "10px"
            });

            const title = document.createElement("h3");
            title.textContent = "Edit Tag";
            title.style.margin = "0";

            const closeBtn = document.createElement("span");
            closeBtn.textContent = "×";
            Object.assign(closeBtn.style, {
                position: "absolute", top: "10px", right: "15px", cursor: "pointer", fontSize: "24px", fontWeight: "bold"
            });
            closeBtn.onclick = () => overlay.style.display = "none";

            const textarea = document.createElement("textarea");
            textarea.className = "prompt-bubbles-edit-input";
            textarea.placeholder = "Enter tag or prompt...";
            Object.assign(textarea.style, {
                width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #ccc",
                fontSize: "14px", fontFamily: "inherit", resize: "none", overflow: "hidden",
                boxSizing: "border-box"
            });

            const autoExpand = () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            };
            textarea.addEventListener('input', autoExpand);

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save";
            saveBtn.className = "prompt-bubbles-translate-btn";
            saveBtn.style.alignSelf = "flex-end";
            saveBtn.onclick = () => {
                if (currentEditCallback) currentEditCallback(textarea.value);
                overlay.style.display = "none";
            };

            textarea.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    saveBtn.click();
                }
            });

            modal.appendChild(closeBtn);
            modal.appendChild(title);
            modal.appendChild(textarea);
            modal.appendChild(saveBtn);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            return { overlay, input: textarea, autoExpand };
        }

        const { overlay: editOverlay, input: editInput, autoExpand: editAutoExpand } = createEditModal();
        let currentEditCallback = null;

        function openEditModal(initialValue, onSave) {
            editInput.value = initialValue;
            currentEditCallback = onSave;
            editOverlay.style.display = "flex";
            setTimeout(() => {
                editInput.focus();
                editAutoExpand();
            }, 50);
        }

        // -------------------------------------------------------------------------
        // Main UI Creation (Scoped per Tab)
        // -------------------------------------------------------------------------
        function createSearchBar(promptTextarea, negPromptTextarea, tabName) {
            const container = document.createElement("div");
            container.className = "prompt-bubbles-search-container";
            // New Layout: [Auto Input (250px min)] [Dict Search (150px)] [Tools]
            container.style.display = "flex";
            container.style.gap = "6px";
            container.style.alignItems = "center";
            container.style.flexWrap = "wrap";

            // 1. Native Autocomplete Input (Left, Flex 2)
            const autoContainer = document.createElement("div");
            autoContainer.style.flex = "2 1 200px"; // Grow 2, Shrink 1, Base 200px
            autoContainer.style.position = "relative";

            const autoInput = document.createElement("input");
            autoInput.className = "prompt-bubbles-autocomplete-input";
            autoInput.placeholder = "Autocomplete..."; // Cleaner
            autoInput.style.width = "100%";

            const mainAutocompleteList = document.createElement("div");
            mainAutocompleteList.className = "prompt-bubbles-autocomplete-list";
            Object.assign(mainAutocompleteList.style, {
                position: "absolute", top: "100%", left: "0", width: "100%", maxHeight: "300px",
                overflowY: "auto", backgroundColor: "#fff", border: "1px solid #ccc", zIndex: "1001", display: "none"
            });

            autoContainer.appendChild(autoInput);
            autoContainer.appendChild(mainAutocompleteList);

            // 2. Dictionary Search (Flex 1)
            const dictContainer = document.createElement("div");
            dictContainer.style.flex = "1 1 150px";
            dictContainer.style.position = "relative";

            const dictInput = document.createElement("input");
            dictInput.className = "prompt-bubbles-search-input";
            dictInput.placeholder = "Dictionary..."; // Cleaner
            dictInput.style.width = "100%";

            const dictAutocompleteList = document.createElement("div");
            dictAutocompleteList.className = "prompt-bubbles-autocomplete-list";
            Object.assign(dictAutocompleteList.style, {
                position: "absolute", top: "100%", left: "0", width: "100%", maxHeight: "300px",
                overflowY: "auto", backgroundColor: "#fff", border: "1px solid #ccc", zIndex: "1001", display: "none"
            });

            dictContainer.appendChild(dictInput);
            dictContainer.appendChild(dictAutocompleteList);

            // 3. Tools (Right)
            const toolsContainer = document.createElement("div");
            toolsContainer.style.display = "flex";
            toolsContainer.style.gap = "4px";
            toolsContainer.style.alignItems = "center";

            // Settings Button
            const settingsBtn = document.createElement("button");
            settingsBtn.textContent = "⚙️";
            settingsBtn.className = "prompt-bubbles-translate-btn";
            settingsBtn.style.backgroundColor = "#64748b"; // Gray
            settingsBtn.style.padding = "8px";
            settingsBtn.title = "Settings";
            settingsBtn.onclick = () => {
                settingsOverlay.style.display = "flex";
            };

            const prefSelect = document.createElement("select");
            [-1, 0, 1, 2].forEach(p => {
                const opt = document.createElement("option");
                opt.value = p; opt.textContent = `Pref: ${p}`;
                if (p === 0) opt.selected = true;
                prefSelect.appendChild(opt);
            });

            const addBtn = document.createElement("button");
            addBtn.textContent = "+Dict";
            addBtn.className = "prompt-bubbles-translate-btn";
            addBtn.style.backgroundColor = "#10b981";

            const translateBtn = document.createElement("button");
            translateBtn.className = "prompt-bubbles-translate-btn";
            translateBtn.textContent = "Translate";

            toolsContainer.appendChild(settingsBtn);
            toolsContainer.appendChild(prefSelect);
            toolsContainer.appendChild(addBtn);
            toolsContainer.appendChild(translateBtn);

            container.appendChild(autoContainer);
            container.appendChild(dictContainer);
            container.appendChild(toolsContainer);

            promptTextarea.parentElement.parentElement.insertBefore(container, promptTextarea.parentElement);

            // --- Logic: Native Autocomplete ---
            let fetchTimeout;
            autoInput.addEventListener("input", () => {
                const query = autoInput.value.trim();
                if (!query) { mainAutocompleteList.style.display = 'none'; return; }

                clearTimeout(fetchTimeout);
                fetchTimeout = setTimeout(async () => {
                    try {
                        const response = await fetch(`/prompt_bubbles/search_tags?query=${encodeURIComponent(query)}&limit=20`);
                        const tags = await response.json();
                        renderNativeAutocomplete(tags);
                    } catch (e) { console.error("Tag search failed", e); }
                }, 200);
            });

            autoInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const val = autoInput.value.trim();
                    if (val) {
                        addTagToPrompt(val, "");
                        autoInput.value = "";
                        mainAutocompleteList.style.display = 'none';
                    }
                }
            });

            function renderNativeAutocomplete(tags) {
                mainAutocompleteList.innerHTML = "";
                if (!tags || tags.length === 0) { mainAutocompleteList.style.display = 'none'; return; }

                tags.forEach(t => {
                    const item = document.createElement("div");
                    item.className = "prompt-bubbles-autocomplete-item native-item";

                    const row = document.createElement("div");
                    row.className = "ac-row";

                    const nameSpan = document.createElement("span");
                    nameSpan.className = "ac-tag-name";
                    nameSpan.textContent = t.tag;
                    nameSpan.style.color = t.color || "#3b82f6";
                    nameSpan.style.fontWeight = "bold";

                    const rightContainer = document.createElement("div");
                    rightContainer.style.display = "flex";
                    rightContainer.style.flexDirection = "column";
                    rightContainer.style.alignItems = "flex-end";

                    const countSpan = document.createElement("span");
                    countSpan.className = "ac-count";
                    let countStr = t.count + "";
                    if (t.count > 1000) countStr = (t.count / 1000).toFixed(1) + "k";
                    countSpan.textContent = countStr;
                    countSpan.style.color = "#9ca3af";
                    countSpan.style.fontSize = "0.85em";

                    rightContainer.appendChild(countSpan);

                    if (t.extra) {
                        const extraSpan = document.createElement("span");
                        extraSpan.className = "ac-extra";
                        extraSpan.textContent = t.extra;
                        extraSpan.style.color = "#9ca3af";
                        extraSpan.style.fontSize = "0.7em";
                        extraSpan.style.marginTop = "-2px";
                        rightContainer.appendChild(extraSpan);
                    }

                    row.appendChild(nameSpan);
                    row.appendChild(rightContainer);

                    item.appendChild(row);

                    if (t.aliases) {
                        const aliasDiv = document.createElement("div");
                        aliasDiv.className = "ac-aliases";
                        aliasDiv.textContent = t.aliases; // full alias string
                        aliasDiv.style.color = "#6b7280";
                        aliasDiv.style.fontSize = "0.8em";
                        aliasDiv.style.marginTop = "2px";
                        aliasDiv.style.whiteSpace = "nowrap";
                        aliasDiv.style.overflow = "hidden";
                        aliasDiv.style.textOverflow = "ellipsis";
                        item.appendChild(aliasDiv);
                    }

                    item.onclick = () => {
                        addTagToPrompt(t.tag, "");
                        autoInput.value = "";
                        mainAutocompleteList.style.display = 'none';
                    };
                    mainAutocompleteList.appendChild(item);
                });
                mainAutocompleteList.style.display = 'block';
            }

            // --- Logic: Dict Search ---
            const updateDictAutocomplete = () => {
                const val = dictInput.value.trim().toLowerCase();
                if (!val && !userSettings.showAllDict) { dictAutocompleteList.style.display = 'none'; return; }

                // Filter by Tag OR Translation
                const matches = Object.keys(dictionary).filter(k => {
                    if (!val) return true; // Show all if no query
                    const entry = dictionary[k];
                    const trans = entry.translation || "";
                    return k.toLowerCase().includes(val) || trans.toLowerCase().includes(val);
                });
                renderDictAutocomplete(matches);
            };
            dictInput.addEventListener("input", updateDictAutocomplete);
            dictInput.addEventListener("click", updateDictAutocomplete);

            // Listen for settings change
            settingsCheckShowAll.addEventListener("change", updateDictAutocomplete);

            dictInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const val = dictInput.value.trim();
                    if (val) {
                        const entry = dictionary[val];
                        if (entry) {
                            // Use setting for translation inclusion
                            const trans = userSettings.includeTranslation ? entry.translation : "";
                            addTagToPrompt(val, trans);
                        }
                        else {
                            const { text, translation } = parseTag(val);
                            addTagToPrompt(text, translation);
                        }
                        dictInput.value = "";
                        dictAutocompleteList.style.display = 'none';
                    }
                }
            });

            function renderDictAutocomplete(matches) {
                dictAutocompleteList.innerHTML = "";
                if (matches.length === 0) { dictAutocompleteList.style.display = 'none'; return; }
                matches.slice(0, 50).forEach(key => {
                    const item = document.createElement("div");
                    item.className = "prompt-bubbles-autocomplete-item";
                    const entry = dictionary[key];

                    // Show translation in list always
                    const transText = entry.translation ? ` @@${entry.translation}@@` : "";
                    item.textContent = `* ${key}${transText}`;

                    item.onclick = () => {
                        // Use setting for translation inclusion
                        const trans = userSettings.includeTranslation ? entry.translation : "";
                        addTagToPrompt(key, trans);
                        dictInput.value = "";
                        dictAutocompleteList.style.display = 'none';
                    };
                    dictAutocompleteList.appendChild(item);
                });
                dictAutocompleteList.style.display = 'block';
            }

            document.addEventListener("click", (e) => {
                if (!container.contains(e.target) && !settingsOverlay.contains(e.target)) {
                    mainAutocompleteList.style.display = 'none';
                    dictAutocompleteList.style.display = 'none';
                }
            });

            document.addEventListener("prompt-bubble-search-fill", (e) => {
                const { tag, trans, originTab } = e.detail; // Expect tab info?

                // Check visibility or tab matching. 
                // Since we don't strictly pass tab in event yet (need to update dispatch),
                // We can check if this search bar is currently visible?
                // Or simpler: Update ALL search bars. It's not a big deal if img2img search bar also gets the text.
                // But focus stealing is bad.

                // Better: Only focus if the search bar belongs to the active tab?
                // Determining active tab is tricky in pure JS without querying UI classes.
                // Let's rely on checking if the event came from this tab's bubble?

                // Update: We passed 'tabName' to createSearchBar.
                // We can check if the currently active tab matches 'tabName'.
                // The active tab in WebUI usually has a class or style 'display: block'.

                const myTabContent = document.getElementById(`tab_${tabName}`);
                // In SD 1.5/Forge, tab structure is #tab_txt2img, #tab_img2img
                // Check if it's visible
                let isVisible = false;
                if (myTabContent && myTabContent.style.display !== 'none') isVisible = true;

                // Also check standard gradio tabs class "tab-item"
                // Actually, simply checking if the textarea is visible is a good proxy.
                if (promptTextarea.offsetParent !== null) {
                    dictInput.value = tag + (trans ? `@@${trans}@@` : "");
                    dictInput.focus();
                    if (dictionary[tag]) prefSelect.value = dictionary[tag].preference;
                }
            });

            addBtn.onclick = async () => {
                const val = dictInput.value.trim();
                if (!val) return;

                const { text: tag, translation } = parseTag(val);
                const pref = parseInt(prefSelect.value);
                const entry = { translation: translation, preference: pref };

                dictionary[tag] = entry; // Optimistic update

                try {
                    addBtn.textContent = "Saving...";
                    addBtn.disabled = true;
                    const response = await fetch("/prompt_bubbles/save_dict", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tag, entry })
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        addBtn.textContent = "Saved!";
                        setTimeout(() => { addBtn.textContent = "+Dict"; addBtn.disabled = false; }, 1000);
                    } else {
                        console.error("Save error:", result);
                        alert("Save failed: " + (result.error || "Unknown error"));
                        addBtn.textContent = "Error";
                        setTimeout(() => { addBtn.textContent = "+Dict"; addBtn.disabled = false; }, 1000);
                    }
                } catch (e) {
                    console.error(e);
                    alert("Network request failed");
                    addBtn.textContent = "Error";
                    setTimeout(() => { addBtn.textContent = "+Dict"; addBtn.disabled = false; }, 1000);
                }
            };

            translateBtn.onclick = async () => {
                // Helper to process a single prompt text into tokens and needed translations
                const processPrompt = (text) => {
                    const tokens = tokenize(text);
                    let partsToTranslate = [];
                    let preCalcTransMap = {}; // Map<"idx_subIdx", translation>

                    tokens.forEach((token, idx) => {
                        const type = identifyToken(token);
                        // Helper to check dict or add to translate queue
                        const checkOrQueue = (text, subIdx) => {
                            // Safety Check: Avoid translating LoRA tags or Embeddings even if they are passed as text
                            const trimmed = text.trim();
                            if (trimmed.startsWith('<') && trimmed.endsWith('>')) return;
                            if (trimmed.startsWith('#<') && trimmed.endsWith('>')) return;

                            if (dictionary[text] && dictionary[text].translation) {
                                preCalcTransMap[`${idx}_${subIdx}`] = dictionary[text].translation;
                            } else {
                                partsToTranslate.push({ idx, subIdx, text });
                            }
                        };

                        if (type === 'lora') {
                            // Skip LoRA tags
                            return;
                        }

                        if (type === 'plain') {
                            const { text } = parseTag(token);
                            checkOrQueue(text, -1);
                        } else if (type === 'dynamic') {
                            const regex = /({[^{}]+})/g;
                            const parts = token.split(regex);
                            parts.forEach((part, partIdx) => {
                                if (!part) return;
                                if (part.startsWith('{') && part.endsWith('}')) {
                                    const inner = part.substring(1, part.length - 1);
                                    const opts = inner.split('|');
                                    opts.forEach((opt, optIdx) => {
                                        const { text } = parseTag(opt);
                                        checkOrQueue(text, `dyn_${partIdx}_${optIdx}`);
                                    });
                                } else {
                                    const { text } = parseTag(part);
                                    if (text.trim()) checkOrQueue(text, `txt_${partIdx}`);
                                }
                            });
                        } else if (type === 'weight') {
                            const content = token.substring(1, token.length - 1);
                            const weightMatch = content.lastIndexOf(':');
                            let tagPart = content;
                            if (weightMatch > 0) tagPart = content.substring(0, weightMatch);
                            const { text } = parseTag(tagPart);
                            checkOrQueue(text, -2);
                        }
                    });

                    return { tokens, partsToTranslate, preCalcTransMap };
                };

                const posData = processPrompt(promptTextarea.value);
                const negData = processPrompt(negPromptTextarea.value);

                // If everything is in dictionary for both, just apply
                if (posData.partsToTranslate.length === 0 && negData.partsToTranslate.length === 0) {
                    applyTranslation(promptTextarea, posData.tokens, posData.preCalcTransMap, {});
                    applyTranslation(negPromptTextarea, negData.tokens, negData.preCalcTransMap, {});
                    return;
                }

                // Combine for API call
                const allParts = [
                    ...posData.partsToTranslate.map(p => ({ ...p, type: 'pos' })),
                    ...negData.partsToTranslate.map(p => ({ ...p, type: 'neg' }))
                ];

                const joinedText = allParts.map(p => p.text).join("\n");

                translateBtn.textContent = "Translating...";
                translateBtn.disabled = true;
                try {
                    const response = await fetch("/prompt_bubbles/translate", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: joinedText, tl: userSettings.translateLanguage || "ko" })
                    });
                    const result = await response.json();
                    if (result.translation) {
                        const translatedLines = result.translation.split("\n");

                        let posApiMap = {};
                        let negApiMap = {};

                        allParts.forEach((p, i) => {
                            const trans = translatedLines[i] ? translatedLines[i].trim() : "";
                            if (p.type === 'pos') {
                                posApiMap[`${p.idx}_${p.subIdx}`] = trans;
                            } else {
                                negApiMap[`${p.idx}_${p.subIdx}`] = trans;
                            }
                        });

                        applyTranslation(promptTextarea, posData.tokens, posData.preCalcTransMap, posApiMap);
                        applyTranslation(negPromptTextarea, negData.tokens, negData.preCalcTransMap, negApiMap);
                    }
                } catch (e) { alert("Translation failed"); console.error(e); }
                finally { translateBtn.textContent = "Translate"; translateBtn.disabled = false; }
            };

            function applyTranslation(targetTextarea, tokens, preCalcMap, apiMap) {
                // Merge maps
                const finalMap = { ...preCalcMap, ...apiMap };

                const newTokens = tokens.map((token, idx) => {
                    const type = identifyToken(token);
                    if (type === 'plain') {
                        const { text } = parseTag(token);
                        const newTrans = finalMap[`${idx}_-1`];
                        if (newTrans && newTrans !== text) return `${text}@@${newTrans}@@`;
                        return token;
                    } else if (type === 'dynamic') {
                        // Mixed Reconstruct
                        const regex = /({[^{}]+})/g;
                        const parts = token.split(regex);
                        const newParts = parts.map((part, partIdx) => {
                            if (!part) return "";
                            if (part.startsWith('{') && part.endsWith('}')) {
                                const inner = part.substring(1, part.length - 1);
                                const opts = inner.split('|');
                                const newOpts = opts.map((opt, optIdx) => {
                                    const { text } = parseTag(opt);
                                    const newTrans = finalMap[`${idx}_dyn_${partIdx}_${optIdx}`];
                                    if (newTrans && newTrans !== text) return `${text}@@${newTrans}@@`;
                                    return opt;
                                });
                                return `{${newOpts.join('|')}}`;
                            } else {
                                // Text part
                                const { text } = parseTag(part);
                                const newTrans = finalMap[`${idx}_txt_${partIdx}`];
                                if (newTrans && newTrans !== text) return `${text}@@${newTrans}@@`;
                                return part;
                            }
                        });
                        return newParts.join("");
                    } else if (type === 'weight') {
                        const trans = finalMap[`${idx}_-2`];
                        if (!trans) return token;
                        // v6.0.0 Fix: Embed translation inside weight syntax (Rollback Structure)
                        // (tag:1.2) -> (tag@@trans@@:1.2)

                        const content = token.substring(1, token.length - 1);
                        const weightMatch = content.lastIndexOf(':');

                        if (weightMatch > 0) {
                            const tagPart = content.substring(0, weightMatch);
                            const weightPart = content.substring(weightMatch);
                            const { text: base } = parseTag(tagPart);
                            if (trans !== base) return `(${base}@@${trans}@@${weightPart})`;
                        } else {
                            const { text: base } = parseTag(content);
                            if (trans !== base) return `(${base}@@${trans}@@)`;
                        }
                        return token;
                    }
                    return token;
                });
                targetTextarea.value = newTokens.join(", ");
                targetTextarea.dispatchEvent(new Event("input", { bubbles: true }));
            }

            function addTagToPrompt(tag, translation) {
                // Fix: Do not append translation to LoRA/Embedding tags (<...>)
                let textToAdd = tag;

                // Grouping Logic: If tag contains comma, convert to group syntax !!A/B!!
                if (tag.includes(',')) {
                    // Split by comma, trim, join with /
                    const parts = tag.split(',').map(p => p.trim()).filter(p => p);
                    textToAdd = `!!${parts.join('/')}!!`;
                }
                else if (translation && !(tag.startsWith('<') && tag.endsWith('>'))) {
                    textToAdd = `${tag}@@${translation}@@`;
                }

                // --- New Logic: Insert at Selection ---
                try {
                    const selected = document.querySelectorAll('.prompt-bubble.selected, .sub-bubble.selected');
                    if (selected.length > 0) {
                        const first = selected[0];
                        const container = first.closest('.prompt-bubble-container');

                        if (container && container.updateTextarea) {
                            const temp = document.createElement("span");
                            temp.dataset.tag = textToAdd;
                            temp.textContent = textToAdd; // For dynamic groups logic

                            if (first.classList.contains('sub-bubble')) {
                                // Inside a group. Insert temp before selection.
                                first.parentElement.insertBefore(temp, first);

                                // Force update of group tag if it's a 'group' type (!!...!!)
                                const groupBubble = first.closest('.prompt-bubble');
                                if (groupBubble && groupBubble.dataset.type === 'group') {
                                    // Logic: treat 'temp' as a sub-bubble for manual reconstruction
                                    // Note: We don't have easy access to reusable reconstruction logic here without massive code duplication
                                    // or exposing normalizeGroup.
                                    // But simply updating the textContent and dataset.type='group' bubble might fail if updateTextarea doesn't handle it.
                                    // HOWEVER, we previously found that updateTextarea DOES NOT handle 'group' type explicitly.
                                    // So 'group' bubbles MUST rely on something else or are treated as 'dynamic'?
                                    // Wait, identifyToken returns 'group'. createBubbleElement sets 'group'.
                                    // If updateTextarea (1238) falls through for 'group', it reads b.dataset.tag.
                                    // b.dataset.tag IS STATIC for group bubbles if updateTextarea doesn't change it.
                                    // So we MUST update it manually here.

                                    // 1. Mark temp as sub-bubble so it's queryable
                                    temp.classList.add('sub-bubble');

                                    // 2. Select all subs (including temp) in order
                                    // parentElement is likely the group bubble itself (no wrapper for groups)
                                    const subs = Array.from(groupBubble.querySelectorAll('.sub-bubble'));
                                    const tags = subs.map(s => {
                                        const t = s.dataset.tag;
                                        const tr = s.dataset.translation;
                                        return tr ? `${t}@@${tr}@@` : t;
                                    });

                                    // 3. Update dataset.tag
                                    groupBubble.dataset.tag = `!!${tags.join('/')}!!`;
                                }
                            } else {
                                // Main bubble area
                                container.insertBefore(temp, first);
                            }

                            container.updateTextarea(true);
                            return;
                        }
                    }
                } catch (e) { console.error("[Prompt Bubbles] Insert selection error", e); }

                const currentVal = promptTextarea.value;
                const sep = currentVal.trim() ? ", " : "";
                promptTextarea.value = currentVal + sep + textToAdd;
                promptTextarea.dispatchEvent(new Event("input", { bubbles: true }));
            }

            return { input: dictInput };
        }

        // -------------------------------------------------------------------------
        // Bubble Container Logic
        // -------------------------------------------------------------------------
        function createBubbleContainer(textarea, isNegative = false) {
            const container = document.createElement("div");
            container.className = "prompt-bubble-container";
            container.linkedTextarea = textarea; // Link explicit reference
            textarea.parentElement.insertBefore(container, textarea);
            textarea.style.display = "none";

            let ignoreNextChange = false;

            container.updateTextarea = function (forceRender = false) {
                const bubbles = Array.from(container.children);
                const tags = bubbles.map(b => {
                    if (b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return null;
                    if (b.dataset.tempOverride) return b.dataset.tempOverride;
                    if (b.classList.contains("editing")) {
                        const input = b.querySelector('input');
                        return input ? input.value : b.dataset.tag;
                    }
                    if (b.dataset.type === 'dynamic') {
                        // v5.9.2 Fix: Mixed content reconstruction + Safety check
                        let parts = [];
                        b.childNodes.forEach(node => {
                            if (node.nodeType === Node.TEXT_NODE) {
                                parts.push(node.textContent);
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.classList.contains('dynamic-wrapper')) {
                                    const subBubbles = Array.from(node.querySelectorAll('.sub-bubble'));
                                    const subParts = subBubbles.map(sb => {
                                        const t = sb.dataset.tag;
                                        const tr = sb.dataset.translation || "";
                                        return tr ? `${t}@@${tr}@@` : t;
                                    });
                                    parts.push(`{${subParts.join('|')}}`);
                                } else if (node.classList.contains('bubble-remove')) {
                                    // ignore
                                } else {
                                    // Static span (potentially with translation)
                                    // We iterate childNodes to handle "text[[trans]]text" correctly
                                    let spanText = "";
                                    node.childNodes.forEach(child => {
                                        if (child.nodeType === Node.TEXT_NODE) {
                                            spanText += child.textContent;
                                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                                            if (child.classList.contains('prompt-bubble-translation')) {
                                                spanText += `@@${child.textContent}@@`;
                                            } else {
                                                spanText += child.textContent;
                                            }
                                        } else {
                                            // fallback for other nodes in span (unlikely)
                                            spanText += child.textContent;
                                        }
                                    });
                                    parts.push(spanText);
                                }
                            }
                        });
                        const newTag = parts.join('');
                        b.dataset.tag = newTag;
                        return newTag;
                    }
                    if (b.dataset.type === 'lora') return b.dataset.tag;
                    const text = b.dataset.tag;
                    if (!text && !b.dataset.weight) return null;
                    const translation = b.dataset.translation || "";

                    // Fix: Do not append translation to LoRA/Embedding tags (<...>) as it breaks generation
                    let final = text;
                    // If it is NOT a weight, handle standard translation insertion
                    // For weights, we reconstruct syntax first, THEN append translation.

                    if (b.dataset.weight) {
                        // Embed translation inside weight syntax
                        if (translation) final = `${final}@@${translation}@@`;

                        if (b.dataset.weightValueExplicit) final = `(${final}:${b.dataset.weightValueExplicit})`;
                        else {
                            if (b.dataset.weightSyntax === 'square') final = `[${final}]`;
                            else final = `(${final})`;
                        }
                    } else {
                        // Standard tag
                        if (translation && !(text.startsWith('<') && text.endsWith('>'))) {
                            final = `${text}@@${translation}@@`;
                        }
                    }

                    return final;
                }).filter(t => t);

                const newValue = tags.join(", ");
                if (textarea.value !== newValue || forceRender) {
                    if (!forceRender) ignoreNextChange = true;
                    textarea.value = newValue;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                }
            };

            textarea.addEventListener("input", (e) => {
                if (ignoreNextChange) {
                    ignoreNextChange = false;
                    return;
                }

                // Feature: Auto-bubble for external inputs (e.g., PNG Info, Presets)
                // If event is untrusted (programmatic), render immediately.
                if (!e.isTrusted) {
                    renderBubbles(textarea.value);
                }
            });

            // Attach explicit refresh callback for the Hook logic
            textarea.forceRefreshBubbles = (val) => {
                // If we are currently ignoring changes (internal update), skip to avoid loop
                if (ignoreNextChange) return;

                // We use a small timeout to let the UI settle if needed, or render immediately
                // Render immediately for responsiveness
                renderBubbles(val || textarea.value);
            };

            // Global Deselect logic (click outside bubbles or ESC)
            const deselectAll = () => {
                const selected = container.querySelectorAll('.prompt-bubble.selected, .sub-bubble.selected');
                if (selected.length > 0) {
                    selected.forEach(el => el.classList.remove('selected'));
                }
            };

            // Click anywhere outside bubbles to deselect
            document.addEventListener('click', (e) => {
                // Check if click target is NOT a bubble or part of one
                if (!e.target.closest('.prompt-bubble') && !e.target.closest('.sub-bubble') && !e.target.closest('.prompt-bubbles-search-container')) {
                    deselectAll();
                }
            });

            // ESC to deselect & Ctrl+C to Copy
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    deselectAll();
                }
                // Ctrl+C (Smart Copy)
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                    const selected = Array.from(container.querySelectorAll('.prompt-bubble.selected, .sub-bubble.selected'));
                    if (selected.length === 0) return; // Let other containers or default copy handle it

                    // If user has native text selection, maybe prefer that? 
                    // But usually bubble selection implies intent. 
                    // We'll prioritize bubble selection.

                    e.preventDefault();
                    e.stopPropagation();

                    // Check selection type
                    const allSub = selected.every(el => el.classList.contains('sub-bubble'));
                    let separator = ", ";

                    if (allSub && selected.length > 1) {
                        const firstParent = selected[0].closest('.prompt-bubble');
                        const sameParent = selected.every(el => el.closest('.prompt-bubble') === firstParent);
                        if (sameParent) {
                            separator = "|";
                        }
                    }

                    const parts = selected.map(el => {
                        const tag = el.dataset.tag;
                        const trans = el.dataset.translation;
                        // Reconstruct syntax
                        if (trans && !userSettings.excludeTranslationOnCopy) return `${tag}@@${trans}@@`;

                        if (el.dataset.weight) {
                            const val = el.dataset.weightValue;
                            if (val) return `(${tag}:${val})`;
                            return `(${tag})`;
                        }
                        if (el.classList.contains('bubble-lora')) {
                            return tag; // Tag is full token <lora:...>
                        }
                        if (el.dataset.type === 'dynamic') {
                            // Dynamic bubble dataset.tag is full `{...}`.
                            return tag;
                        }

                        return tag;
                    });

                    const textToCopy = parts.join(separator);
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        // Optional: Visual feedback?
                    });
                }
            });

            // Loop for DnD (v5.9.0 Redesigned)
            let dragCtx = {
                sourceType: null, // 'main' | 'sub'
                items: [],        // Array of elements
                sourceParent: null // For sub-bubbles
            };

            function handleDragStart(e) {
                e.stopPropagation();
                const isSub = this.classList.contains('sub-bubble');
                dragCtx.items = [];
                dragCtx.sourceType = isSub ? 'sub' : 'main';
                dragCtx.sourceParent = isSub ? this.closest('.prompt-bubble') : null;

                if (isSub) {
                    if (this.classList.contains('selected')) {
                        // Drag all selected sub-bubbles
                        // Note: We should probably only drag sub-bubbles to avoid mixing types?
                        // Or filter.
                        const selected = container.querySelectorAll('.sub-bubble.selected');
                        selected.forEach(el => {
                            dragCtx.items.push(el);
                            el.classList.add("dragging");
                        });
                    } else {
                        dragCtx.items.push(this);
                        this.classList.add("dragging");
                    }
                } else {
                    // Main bubble logic
                    if (this.classList.contains('selected')) {
                        // Drag all selected
                        const selected = container.querySelectorAll('.prompt-bubble.selected');
                        selected.forEach(el => {
                            dragCtx.items.push(el);
                            el.classList.add("dragging");
                        });
                    } else {
                        // Drag just this one (clear others?)
                        // For standard behavior, if I drag unselected, it becomes the only selection
                        // But here we just drag it.
                        dragCtx.items.push(this);
                        this.classList.add("dragging");
                    }
                }

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', this.outerHTML); // Not really used but required
            }

            function handleDragOver(e) {
                e.preventDefault();
                e.stopPropagation();

                // Visual feedback could be added here
                const target = e.target.closest('.prompt-bubble') || e.target.closest('.sub-bubble');

                // Allow drop
                e.dataTransfer.dropEffect = 'move';
                return false;
            }

            function handleDrop(e) {
                e.preventDefault();
                e.stopPropagation();

                const targetSub = e.target.closest('.sub-bubble');
                const targetMain = e.target.closest('.prompt-bubble');
                const targetContainer = container; // We are inside createBubbleContainer closure

                // Helper to clean up drag handling
                const finish = () => {
                    dragCtx.items.forEach(el => el.classList.remove('dragging'));
                    container.updateTextarea();
                };

                if (dragCtx.items.length === 0) return false;

                // Scenario 1: Source is Main Bubble(s)
                if (dragCtx.sourceType === 'main') {
                    if (targetSub) {
                        // Drop Main into Group (at specific sub position)
                        const groupBubble = targetSub.closest('.prompt-bubble');
                        if (groupBubble) {
                            const wrapper = groupBubble.querySelector('.dynamic-wrapper');
                            // Calculate position
                            const box = targetSub.getBoundingClientRect();
                            const offset = e.clientX - box.left - box.width / 2;

                            // Process items
                            dragCtx.items.forEach(item => {
                                if (item === groupBubble) return; // Can't put group inside itself

                                // Extract data
                                let tag = item.dataset.tag;
                                const trans = item.dataset.translation;

                                // v5.9.4 Fix: Handle weighted bubbles being dropped into group
                                if (item.dataset.weight) {
                                    const val = item.dataset.weightValue;
                                    if (val) tag = `(${tag}:${val})`;
                                    else tag = `(${tag})`; // default weight syntax
                                } else if (item.classList.contains('bubble-lora')) {
                                    // For LoRA, dataset.tag is arguably the full token or the name. 
                                    // createBubbleElement logic below sets it to full token.
                                }

                                // Remove original Main Bubble
                                item.remove();

                                // Create new Sub Bubble DOM
                                const sub = document.createElement("span");
                                sub.className = "sub-bubble";
                                sub.draggable = true;

                                // Attach sub-drag handlers (Must match createBubbleElement logic)
                                sub.addEventListener("dragstart", handleDragStart);
                                sub.addEventListener("dragover", handleDragOver);
                                sub.addEventListener("drop", handleDrop);
                                sub.addEventListener("dragend", handleDragEnd);
                                // v5.9.3 Sub-bubble Edit Logic
                                sub.addEventListener('click', function (e) {
                                    e.stopPropagation(); e.preventDefault();
                                    if (e.altKey || e.shiftKey || e.ctrlKey) {
                                        if (this.classList.contains('selected')) this.classList.remove('selected');
                                        else this.classList.add('selected');
                                        return;
                                    }
                                    const t = this.dataset.tag;
                                    const tr = this.dataset.translation;
                                    const full = tr && !userSettings.hideTranslationOnEdit ? `${t}@@${tr}@@` : t;
                                    openEditModal(full, (newValue) => {
                                        const newVal = newValue.trim();
                                        const parentGroup = this.closest('.prompt-bubble');
                                        if (!newVal) {
                                            this.remove();
                                            normalizeGroup(parentGroup);
                                            container.updateTextarea();
                                        } else {
                                            const parsed = parseTag(newVal);
                                            // Handle auto-parentheses for tags ending with :number
                                            if (/^[^()<>[\]]+:\d+(\.\d+)?$/.test(parsed.text)) {
                                                parsed.text = `(${parsed.text})`;
                                            }

                                            this.textContent = parsed.text;
                                            this.dataset.tag = parsed.text;

                                            // Restore original translation if hidden and no new one provided
                                            if (!parsed.translation && tr && userSettings.hideTranslationOnEdit && full === t) {
                                                parsed.translation = tr;
                                            }

                                            if (parsed.translation) {
                                                this.dataset.translation = parsed.translation;
                                                const trSpan = document.createElement("span");
                                                trSpan.className = "prompt-bubble-translation";
                                                trSpan.textContent = parsed.translation;
                                                this.appendChild(trSpan);
                                            } else {
                                                delete this.dataset.translation;
                                            }
                                            container.updateTextarea();
                                        }
                                    });
                                });

                                sub.textContent = tag;
                                sub.dataset.tag = tag;

                                if (trans) {
                                    sub.dataset.translation = trans;
                                    const tr = document.createElement("span");
                                    tr.className = "prompt-bubble-translation";
                                    tr.textContent = trans;
                                    sub.appendChild(tr);
                                }

                                // Insert into group
                                if (offset < 0) {
                                    targetSub.before(sub);
                                } else {
                                    targetSub.after(sub);
                                }
                            });

                            // Re-add separators and cleanup
                            normalizeGroup(groupBubble);
                        }
                    }
                    else if (targetMain) {
                        // Drop Main onto Main
                        // Simple Reorder
                        const box = targetMain.getBoundingClientRect();
                        const offset = e.clientX - box.left - box.width / 2;
                        const items = dragCtx.items;

                        items.forEach(item => {
                            if (item === targetMain) return;
                            if (offset < 0) container.insertBefore(item, targetMain);
                            else container.insertBefore(item, targetMain.nextSibling);
                        });
                    }
                    else {
                        // Dropped in container (append)
                        dragCtx.items.forEach(item => container.appendChild(item));
                    }
                }

                // Scenario 2: Source is Sub Bubble
                else if (dragCtx.sourceType === 'sub') {
                    const affectedGroups = new Set();

                    // Track source groups for normalization
                    dragCtx.items.forEach(item => {
                        const p = item.closest('.prompt-bubble');
                        if (p) affectedGroups.add(p);
                    });

                    if (targetSub) {
                        // Sub -> Sub (Move inside/between groups)
                        const targetGroup = targetSub.closest('.prompt-bubble');
                        const box = targetSub.getBoundingClientRect();
                        const offset = e.clientX - box.left - box.width / 2;

                        dragCtx.items.forEach(subItem => {
                            // If moving within same group, just move DOM
                            // If moving to different group, move DOM.
                            // Order matters for multiple items?
                            // If we drop multiple, we should keep their relative order?
                            // For simplicity, insert all at target point.

                            if (offset < 0) targetSub.parentElement.insertBefore(subItem, targetSub);
                            else targetSub.parentElement.insertBefore(subItem, targetSub.nextSibling);

                            // If moved to new group, update affected set
                            if (targetGroup) affectedGroups.add(targetGroup);
                        });
                    }
                    else if (targetMain) {
                        // Sub -> Main (Extract)
                        const box = targetMain.getBoundingClientRect();
                        const offset = e.clientX - box.left - box.width / 2;

                        dragCtx.items.forEach(subItem => {
                            const tag = subItem.dataset.tag;
                            const trans = subItem.dataset.translation;
                            const token = trans ? `${tag}[[${trans}]]` : tag;

                            subItem.remove(); // Remove from group

                            const newBubble = createBubbleElement(token, container, isNegative, new Set());
                            if (offset < 0) container.insertBefore(newBubble, targetMain);
                            else container.insertBefore(newBubble, targetMain.nextSibling);
                        });
                    }
                    else {
                        // Sub -> Container (Extract to end)
                        dragCtx.items.forEach(subItem => {
                            const tag = subItem.dataset.tag;
                            const trans = subItem.dataset.translation;
                            const token = trans ? `${tag}[[${trans}]]` : tag;

                            subItem.remove();
                            const newBubble = createBubbleElement(token, container, isNegative, new Set());
                            container.appendChild(newBubble);
                        });
                    }

                    // Normalize all affected groups
                    affectedGroups.forEach(g => normalizeGroup(g));
                }

                finish();
                return false;
            }

            function handleDragEnd() {
                dragCtx.items.forEach(el => el.classList.remove("dragging"));
            }

            // Helper to fix separators | in a group after DOM change
            function normalizeGroup(groupBubble) {
                if (!groupBubble) return;
                const wrapper = groupBubble.querySelector('.dynamic-wrapper');
                if (!wrapper) {
                    if (groupBubble.dataset.type === 'dynamic') groupBubble.remove();
                    return;
                }

                // Reconstruct group tag
                const subBubbles = wrapper.querySelectorAll('.sub-bubble');
                const tags = Array.from(subBubbles).map(sb => sb.dataset.tag);
                const newTag = `!!${tags.join('/')}!!`;
                groupBubble.dataset.tag = newTag;

                // Remove all existing separators
                const seps = wrapper.querySelectorAll('.sub-bubble-separator');
                seps.forEach(s => s.remove());

                // Get all sub-bubbles again (or reuse)
                const subs = wrapper.querySelectorAll('.sub-bubble');
                if (subs.length === 0) {
                    groupBubble.remove();
                    return;
                }

                // Insert separators
                subs.forEach((sub, idx) => {
                    if (idx < subs.length - 1) {
                        const sep = document.createElement("span");
                        sep.className = "sub-bubble-separator";
                        sep.textContent = "|";
                        sub.after(sep);
                    }
                });
            }

            function createBubbleElement(token, container, isNegative, seenTags) {
                const bubble = document.createElement("div");
                bubble.classList.add("prompt-bubble", "draggable");
                bubble.draggable = true;

                // Core Data
                // First: Parse Translation (Separation of Concern)
                // v6.0.0 Fix: Handle (tag:1.2)@@trans@@ structure
                let baseToken = token;
                let externalTrans = "";
                const parsedToken = parseTag(token);
                if (parsedToken.translation) {
                    baseToken = parsedToken.text;
                    externalTrans = parsedToken.translation;
                }

                const type = identifyToken(baseToken); // Use baseToken to identify type!
                let tagText = baseToken;
                let weightVal = null;
                let translation = externalTrans;

                if (type === 'weight') {
                    const { text, value, syntax, explicitVal, depth } = calculateWeight(baseToken);

                    // v6.0.1 Fix: Parse inner translation from weight text (tag@@trans@@)
                    const parsedInner = parseTag(text);
                    tagText = parsedInner.text;
                    if (parsedInner.translation) translation = parsedInner.translation;

                    bubble.dataset.weight = "true";
                    bubble.dataset.tag = tagText;

                    // Store metadata
                    if (explicitVal) bubble.dataset.weightValueExplicit = explicitVal;
                    bubble.dataset.weightValue = value; // Calculated numeric value
                    bubble.dataset.weightSyntax = syntax; // 'round' or 'square'

                    // Determine Type: Strong vs Weak
                    if (value >= 1.0) bubble.dataset.weightType = "strong";
                    else bubble.dataset.weightType = "weak";

                    // Re-construct token logic handled by updateTextarea using dataset properties
                } else if (type === 'dynamic') {
                    // If dynamic, baseToken is the dynamic content
                    bubble.dataset.tag = baseToken;
                    bubble.classList.add("bubble-dynamic");

                    // If translation was attached to dynamic group itself? 
                    // Currently dynamic doesn't support outer translation well, but let's keep it in dataset
                    if (translation) bubble.dataset.translation = translation;

                    const regex = /({[^{}]+})/g;
                    const parts = baseToken.split(regex);

                    parts.forEach(part => {
                        if (!part) return;
                        if (part.startsWith('{') && part.endsWith('}')) {
                            const inner = part.substring(1, part.length - 1);
                            const options = inner.split('|');

                            const dynWrapper = document.createElement("span");
                            dynWrapper.className = "dynamic-wrapper";

                            options.forEach((opt, idx) => {
                                const sub = document.createElement("span");
                                sub.className = "sub-bubble";
                                sub.draggable = true; // Make draggable!

                                // Attach sub-drag handlers
                                sub.addEventListener("dragstart", handleDragStart);
                                sub.addEventListener("dragover", handleDragOver);
                                sub.addEventListener("drop", handleDrop);
                                sub.addEventListener("dragend", handleDragEnd);

                                // v5.9.3 Sub-bubble Edit Logic
                                sub.addEventListener('click', function (e) {
                                    e.stopPropagation();
                                    e.preventDefault();

                                    if (e.target.classList.contains('bubble-remove')) return;

                                    // Multi-select support
                                    if (e.altKey || e.shiftKey || e.ctrlKey) {
                                        if (this.classList.contains('selected')) {
                                            this.classList.remove('selected');
                                        } else {
                                            this.classList.add('selected');
                                        }
                                        return;
                                    }

                                    // Construct full text for editing
                                    const t = this.dataset.tag;
                                    const tr = this.dataset.translation;
                                    const full = tr && !userSettings.hideTranslationOnEdit ? `${t}@@${tr}@@` : t;

                                    openEditModal(full, (newValue) => {
                                        const newVal = newValue.trim();
                                        const parentGroup = this.closest('.prompt-bubble');

                                        if (!newVal) {
                                            this.remove();
                                            normalizeGroup(parentGroup);
                                            container.updateTextarea();
                                        } else {
                                            // Simple update: parse and set
                                            const parsed = parseTag(newVal);

                                            // Handle auto-parentheses for tags ending with :number
                                            if (/^[^()<>[\]]+:\d+(\.\d+)?$/.test(parsed.text)) {
                                                parsed.text = `(${parsed.text})`;
                                            }

                                            this.textContent = parsed.text;
                                            this.dataset.tag = parsed.text;

                                            // Restore original translation if hidden and no new one provided
                                            if (!parsed.translation && tr && userSettings.hideTranslationOnEdit && full === t) {
                                                parsed.translation = tr;
                                            }

                                            if (parsed.translation) {
                                                this.dataset.translation = parsed.translation;
                                                const trSpan = document.createElement("span");
                                                trSpan.className = "prompt-bubble-translation";
                                                trSpan.textContent = parsed.translation;
                                                this.appendChild(trSpan);
                                            } else {
                                                delete this.dataset.translation;
                                            }
                                            container.updateTextarea();
                                        }
                                    });
                                });

                                const parsed = parseTag(opt);
                                sub.textContent = parsed.text;
                                sub.dataset.tag = parsed.text;

                                if (parsed.translation) {
                                    sub.dataset.translation = parsed.translation;
                                    const tr = document.createElement("span");
                                    tr.className = "prompt-bubble-translation";
                                    tr.textContent = parsed.translation;
                                    sub.appendChild(tr);
                                }

                                // Add remove button to sub-bubble
                                const subRemove = document.createElement("span");
                                subRemove.className = "bubble-remove";
                                subRemove.textContent = "×";
                                subRemove.onclick = (e) => {
                                    e.stopPropagation();
                                    sub.remove();
                                    normalizeGroup(bubble);
                                    container.updateTextarea();
                                };
                                sub.appendChild(subRemove);

                                dynWrapper.appendChild(sub);
                                if (idx < options.length - 1) {
                                    const sep = document.createElement("span");
                                    sep.className = "sub-bubble-separator";
                                    sep.textContent = "|";
                                    dynWrapper.appendChild(sep);
                                }
                            });
                            bubble.appendChild(dynWrapper);
                        } else {
                            // Static text part (v5.8.0 Fix: Parse @@translation@@ here too)
                            const span = document.createElement("span");
                            span.style.margin = "0 2px";
                            const partsWithTrans = part.split(/(\@{2}[^@]+\@{2})/g);
                            partsWithTrans.forEach(pt => {
                                if (!pt) return;
                                const match = pt.match(/^\@{2}([^@]+)\@{2}$/);
                                if (match) {
                                    const trText = match[1];
                                    const trSpan = document.createElement("span");
                                    trSpan.className = "prompt-bubble-translation";
                                    trSpan.textContent = trText;
                                    span.appendChild(trSpan);
                                } else {
                                    const txt = document.createTextNode(pt);
                                    span.appendChild(txt);
                                }
                            });
                            bubble.appendChild(span);
                        }
                    });

                    // Add remove button & listeners (Shared with others)
                    bubble.addEventListener("dragstart", handleDragStart);
                    bubble.addEventListener("dragover", handleDragOver);
                    bubble.addEventListener("drop", handleDrop);
                    bubble.addEventListener("dragend", handleDragEnd);
                    bubble.addEventListener("contextmenu", (e) => {
                        if (typeof showContextMenu === 'function') showContextMenu(e, bubble, isNegative);
                    });

                    // Click handler in createBubbleElement below logic...
                    bubble.addEventListener('click', function (e) {
                        // ... (Multi-select logic handled in standard block below)
                        // Because this is inside if(type==='dynamic'), we need to make sure we don't duplicate
                        // Actually original code reused the listener add at the end? 
                        // No, original code had specific listener for group (which I removed in previous read?)
                        // Wait, the original code had `if (type === 'group')` which returns early. 
                        // My `dynamic` block is `if (type === 'dynamic')`.
                        // The original code fell through to shared logic for `dynamic`. 
                        // I need to ensure I don't break that fall-through or duplication.
                    });

                    // Let's rely on the shared code below for bubble events
                } else if (type === 'lora') {
                    tagText = token;
                    bubble.dataset.tag = tagText; // v5.9.4 Fix: Set dataset.tag for lora
                    bubble.classList.add("bubble-lora");
                } else if (type === 'group') {
                    // Group is similar to dynamic but uses !!...!! syntax.
                    bubble.dataset.tag = token;
                    bubble.classList.add("bubble-group");
                    const inner = token.substring(2, token.length - 2);
                    const options = inner.split('/');

                    options.forEach((opt, idx) => {
                        const sub = document.createElement("span");
                        sub.className = "sub-bubble";
                        sub.draggable = true; // Enable drag
                        sub.addEventListener("dragstart", handleDragStart);
                        sub.addEventListener("dragover", handleDragOver);
                        sub.addEventListener("drop", handleDrop);
                        sub.addEventListener("dragend", handleDragEnd);

                        const parsed = parseTag(opt);
                        sub.textContent = parsed.text;
                        sub.dataset.tag = parsed.text;

                        // v5.9.5 Styling: Apply dictionary/type classes to sub-bubbles
                        const entry = dictionary[parsed.text];
                        if (entry) {
                            if (entry.preference === 2) sub.classList.add("preference-2");
                            else if (entry.preference === 1) sub.classList.add("preference-1");
                            else if (entry.preference === -1) sub.classList.add("preference-minus1");

                            if (entry.translation && !parsed.translation) {
                                parsed.translation = entry.translation;
                            }
                        }

                        // Check for Lora or Weight (Simple check)
                        if (parsed.text.startsWith('<lora:') && parsed.text.endsWith('>')) {
                            sub.classList.add("bubble-lora");
                        } else if (/^\(.+:\d+(\.\d+)?\)$/.test(parsed.text)) {
                            sub.dataset.weight = "true";
                        }

                        if (parsed.translation) {
                            sub.dataset.translation = parsed.translation;
                            const tr = document.createElement("span");
                            tr.className = "prompt-bubble-translation";
                            tr.textContent = parsed.translation;
                            sub.appendChild(tr);
                        }

                        // Add remove button to group sub-bubble
                        const subRemove = document.createElement("span");
                        subRemove.className = "bubble-remove";
                        subRemove.textContent = "×";
                        subRemove.onclick = (e) => {
                            e.stopPropagation();
                            sub.remove();
                            normalizeGroup(bubble);
                            container.updateTextarea();
                        };
                        sub.appendChild(subRemove);

                        bubble.appendChild(sub);

                        if (idx < options.length - 1) {
                            const sep = document.createElement("span");
                            sep.className = "sub-bubble-separator";
                            sep.textContent = "/";
                            bubble.appendChild(sep);
                        }
                    });

                    const removeBtn = document.createElement("span");
                    removeBtn.className = "bubble-remove";
                    removeBtn.textContent = "×";
                    removeBtn.onclick = (e) => {
                        e.stopPropagation();
                        bubble.remove();
                        container.updateTextarea();
                    };
                    bubble.appendChild(removeBtn);

                    bubble.addEventListener("dragstart", handleDragStart);
                    bubble.addEventListener("dragover", handleDragOver);
                    bubble.addEventListener("drop", handleDrop);
                    bubble.addEventListener("dragend", handleDragEnd);

                    bubble.addEventListener("contextmenu", (e) => {
                        if (typeof showContextMenu === 'function') showContextMenu(e, bubble, isNegative);
                    });

                    // Need manual click handler here because it returns early
                    bubble.addEventListener('click', function (e) {
                        if (e.target.classList.contains('bubble-remove')) return;
                        if (e.altKey || e.shiftKey || e.ctrlKey) {
                            e.preventDefault(); e.stopPropagation();
                            if (this.classList.contains('selected')) this.classList.remove('selected');
                            else this.classList.add('selected');
                            return;
                        }
                        openEditModal(this.dataset.tag, (newValue) => {
                            const newVal = newValue.trim();
                            if (!newVal) {
                                this.remove();
                                container.updateTextarea();
                            } else {
                                const tokens = tokenize(newVal);
                                const newBubbles = tokens.map(t => {
                                    // Auto-parentheses handle before creation
                                    let tokenVal = t;
                                    const parsed = parseTag(t);
                                    if (/^[^()<>[\]]+:\d+(\.\d+)?$/.test(parsed.text)) {
                                        tokenVal = parsed.translation ? `(${parsed.text})@@${parsed.translation}@@` : `(${parsed.text})`;
                                    }
                                    return createBubbleElement(tokenVal, container, isNegative, new Set());
                                });
                                this.replaceWith(...newBubbles);
                                container.updateTextarea();
                            }
                        });
                    });

                    return bubble;
                }

                if (type !== 'lora' && type !== 'dynamic') {
                    const parsed = parseTag(tagText);
                    tagText = parsed.text;
                    if (parsed.translation) translation = parsed.translation;
                }

                bubble.dataset.tag = tagText;
                if (translation) bubble.dataset.translation = translation;
                bubble.dataset.type = type;

                const lowerTag = tagText.toLowerCase();
                if (seenTags) {
                    if (seenTags.has(lowerTag)) {
                        bubble.classList.add("duplicate");
                    } else {
                        seenTags.add(lowerTag);
                    }
                }

                const entry = dictionary[tagText];
                if (entry) {
                    bubble.classList.add("dictionary-item"); // Mark as dictionary item
                    if (entry.translation && !translation) {
                        translation = entry.translation;
                        bubble.dataset.translation = translation;
                    }
                    if (entry.preference === 2) bubble.classList.add("preference-2");
                    else if (entry.preference === 1) bubble.classList.add("preference-1");
                    else if (entry.preference === -1) bubble.classList.add("preference-minus1");
                }
                if (isNegative) bubble.classList.add("preference-neg");

                if (isMatchDataLoaded) {
                    if (knownTags.has(lowerTag)) {
                        bubble.classList.add("match-tag");
                    }
                    else if (lowerTag.includes(" ") && knownTags.has(lowerTag.replace(/ /g, "_"))) {
                        bubble.classList.add("match-loose");
                    }
                    else if (knownAliases.has(lowerTag)) {
                        bubble.classList.add("match-alias");
                    }
                }

                if (type !== 'dynamic') {
                    const textSpan = document.createElement("span");
                    textSpan.className = "bubble-text";
                    if (type === 'weight') {
                        const textNode = document.createTextNode(tagText);
                        textSpan.appendChild(textNode);

                        // Add Weight Value Display
                        // We show the calculated value (e.g. 1.1, 0.9, 1.5)
                        const wSpan = document.createElement("span");
                        wSpan.className = "bubble-weight-value";

                        // Format display value: max 2 decimals
                        let displayVal = parseFloat(bubble.dataset.weightValue);
                        if (Math.round(displayVal * 100) / 100 === displayVal) {
                            // Integer or simple decimal
                        } else {
                            displayVal = displayVal.toFixed(2);
                        }
                        // v6.0.2 Fix: Nest weight inside text span to ensure correct order "Tag 1.2"
                        // and avoid duplication with shared appended logic below.
                        wSpan.textContent = displayVal;
                        textSpan.appendChild(wSpan);
                    } else {
                        let showT = tagText;
                        if (type === 'lora') {
                            // Beautify LoRA tag for display: <lora:model:1> -> model
                            // Regex to extract model name
                            const match = token.match(/<[^:]+:([^:]+)(?::.*)?>/);
                            if (match && match[1]) {
                                showT = match[1];
                                // Add a small icon or prefix? The CSS background color helps.
                            } else {
                                showT = token;
                            }
                        }
                        textSpan.textContent = showT;
                    }
                    bubble.appendChild(textSpan);

                    if (translation) {
                        const transSpan = document.createElement("span");
                        transSpan.className = "prompt-bubble-translation";
                        transSpan.textContent = translation;
                        bubble.appendChild(transSpan);
                    }
                }

                const removeBtn = document.createElement("span");
                removeBtn.className = "bubble-remove";
                removeBtn.textContent = "×";
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    bubble.remove();
                    container.updateTextarea();
                };
                bubble.appendChild(removeBtn);

                bubble.addEventListener("dragstart", handleDragStart);
                bubble.addEventListener("dragover", handleDragOver);
                bubble.addEventListener("drop", handleDrop);
                bubble.addEventListener("dragend", handleDragEnd);
                bubble.addEventListener("contextmenu", (e) => {
                    if (typeof showContextMenu === 'function') showContextMenu(e, bubble, isNegative);
                });



                bubble.addEventListener('click', function (e) {
                    if (e.target.classList.contains('bubble-remove')) return;

                    // Multi-select logic (v5.9.0)
                    if (e.altKey || e.shiftKey || e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (this.classList.contains('selected')) {
                            this.classList.remove('selected');
                            // We need a global way to track selection, 
                            // but simple class toggle is enough for visual.
                            // For logic, we'll query .selected on dragstart.
                        } else {
                            this.classList.add('selected');
                        }
                        return;
                    }

                    // Standard Edit Logic
                    let currentFullText = "";
                    const type = this.dataset.type;
                    const tag = this.dataset.tag;
                    const trans = this.dataset.translation;

                    if (type === 'dynamic') currentFullText = tag;
                    else if (type === 'lora') currentFullText = tag;
                    else {
                        let base = trans && !userSettings.hideTranslationOnEdit ? `${tag}@@${trans}@@` : tag;
                        if (this.dataset.weight) {
                            if (this.dataset.weightValueExplicit) currentFullText = `(${base}:${this.dataset.weightValueExplicit})`;
                            else {
                                if (this.dataset.weightSyntax === 'square') currentFullText = `[${base}]`;
                                else currentFullText = `(${base})`;
                            }
                        } else {
                            currentFullText = base;
                        }
                    }

                    // If editing, clear selection to avoid confusion? 
                    // Let's clear other selections or just ignore them.
                    document.querySelectorAll('.prompt-bubble.selected').forEach(el => el.classList.remove('selected'));

                    openEditModal(currentFullText, (newValue) => {
                        const newVal = newValue.trim();
                        if (!newVal) {
                            this.remove();
                            container.updateTextarea();
                        } else {
                            let wasHidden = userSettings.hideTranslationOnEdit && trans && currentFullText.indexOf('@@') === -1;

                            const tokens = tokenize(newVal);
                            if (tokens.length === 0) {
                                this.remove();
                                container.updateTextarea();
                                return;
                            }
                            const newBubbles = tokens.map(t => {
                                // Restore translation if it was hidden and tag is singular (not split by comma)
                                let finalT = t;
                                if (wasHidden && tokens.length === 1) {
                                    const p = parseTag(t);
                                    if (!p.translation) {
                                        finalT = `${t}@@${trans}@@`;
                                    }
                                }

                                // Handle auto-parentheses
                                const fp = parseTag(finalT);
                                if (/^[^()<>[\]]+:\d+(\.\d+)?$/.test(fp.text)) {
                                    finalT = fp.translation ? `(${fp.text})@@${fp.translation}@@` : `(${fp.text})`;
                                }

                                return createBubbleElement(finalT, container, isNegative, new Set());
                            });
                            this.replaceWith(...newBubbles);
                            container.updateTextarea();
                        }
                    });
                });

                return bubble;
            }

            const renderBubbles = function (text) {
                // v6.0.3 Fix: Save scroll position to prevent jumping to bottom on re-render
                const savedScrollX = window.scrollX;
                const savedScrollY = window.scrollY;
                // v5.7.4 Fix: Auto-insert comma before LoRA/LyCO/Hypernetwork tags if missing
                // This handles cases where WebUI inserts tags directly without separators (e.g. tag<lora:...>)
                const loraRegex = /([^\s,])(\s*)(<(?:lora|lyco|hypernetwork):)/gi;
                if (loraRegex.test(text)) {
                    const newText = text.replace(loraRegex, "$1, $2$3");
                    if (newText !== text) {
                        console.log("[Prompt Bubbles] Auto-fixing missing comma before LoRA");
                        // We must update the textarea and re-trigger render
                        // This ensures the backend also gets the comma
                        textarea.value = newText;
                        textarea.dispatchEvent(new Event("input", { bubbles: true }));
                        return; // Stop current render, let the new event handle it
                    }
                }

                container.innerHTML = "";
                const tokens = tokenize(text);
                const seenTags = new Set();

                tokens.forEach((token, index) => {
                    const bubble = createBubbleElement(token, container, isNegative, seenTags);
                    container.appendChild(bubble);
                });

                // Input for adding new tags
                const input = document.createElement("textarea");
                input.className = "bubble-input"; input.placeholder = "+"; input.rows = 1;
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                        e.preventDefault(); const val = input.value.trim();
                        if (val) {
                            const currentVal = textarea.value;
                            const sep = currentVal.trim() === "" ? "" : ", ";
                            textarea.value = currentVal + sep + val;
                            textarea.dispatchEvent(new Event("input", { bubbles: true }));
                            input.value = "";
                            setTimeout(() => { const newInput = container.querySelector(".bubble-input"); if (newInput) newInput.focus(); }, 0);
                        }
                    }
                    if (e.key === "Backspace" && input.value === "") {
                        const bubbles = container.querySelectorAll(".prompt-bubble");
                        if (bubbles.length > 0) {
                            bubbles[bubbles.length - 1].remove();
                            container.updateTextarea();
                            // Restore focus to input after deletion logic triggers render Bubbles
                            setTimeout(() => {
                                const newInput = container.querySelector(".bubble-input");
                                if (newInput) newInput.focus();
                            }, 0);
                        }
                    }
                });
                container.appendChild(input);

                // --- v5.4.0 Bulk Action Buttons ---
                const controls = document.createElement("div");
                controls.className = "prompt-bubble-controls";

                const leftGroup = document.createElement("div");
                leftGroup.className = "left-group";

                // 1. Remove Translations
                const clearTransBtn = document.createElement("button");
                clearTransBtn.textContent = "번역 지우기";
                clearTransBtn.onclick = (e) => {
                    e.preventDefault();
                    const current = textarea.value;
                    // Regex to remove @@translation@@ patterns
                    const cleaned = current.replace(/\@{2}[^@]+\@{2}/g, "");
                    if (current !== cleaned) {
                        textarea.value = cleaned;
                        textarea.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                };

                // 2. Clear All
                const clearAllBtn = document.createElement("button");
                clearAllBtn.textContent = "전부 비우기";
                clearAllBtn.className = "danger";
                clearAllBtn.onclick = (e) => {
                    e.preventDefault();
                    if (confirm("정말로 모든 프롬프트를 지우시겠습니까?")) {
                        textarea.value = "";
                        textarea.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                };

                // 3. Copy (Cleaned)
                const copyBtn = document.createElement("button");
                copyBtn.textContent = "복사하기";
                copyBtn.onclick = (e) => {
                    e.preventDefault();
                    // Get value and clean it for generation (remove translations)
                    // v6.0.0: Remove @@trans@@ but KEEP [weak]
                    let current = textarea.value;
                    let cleaned = current;

                    if (userSettings.excludeTranslationOnCopy) {
                        cleaned = current.replace(/\@{2}[^@]+\@{2}/g, "");
                    }

                    navigator.clipboard.writeText(cleaned).then(() => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = "복사됨!";
                        setTimeout(() => copyBtn.textContent = originalText, 1500);
                    }).catch(err => {
                        console.error("Copy failed", err);
                        alert("복사에 실패했습니다.");
                    });
                };

                leftGroup.appendChild(clearTransBtn);
                leftGroup.appendChild(clearAllBtn);
                leftGroup.appendChild(copyBtn);
                controls.appendChild(leftGroup);

                // 4. Refresh Button (v5.7.6)
                const refreshBtn = document.createElement("button");
                refreshBtn.textContent = "Refresh";
                refreshBtn.title = "프롬프트 텍스트를 다시 읽어 버블을 갱신합니다.";
                refreshBtn.style.backgroundColor = "#eab308"; // Yellow/Orange
                refreshBtn.onclick = (e) => {
                    e.preventDefault();
                    refreshBtn.textContent = "Refreshing...";
                    // Small delay to show feedback
                    setTimeout(() => {
                        renderBubbles(textarea.value);
                        // Since renderBubbles recreates buttons, no need to reset text
                    }, 50);
                };
                controls.appendChild(refreshBtn);

                container.appendChild(controls);

                // v6.0.3 Fix: Restore scroll position with delay to override browser focus behavior
                setTimeout(() => {
                    window.scrollTo(savedScrollX, savedScrollY);
                }, 0);
            };

            renderBubbles(textarea.value);
        }

        // Call Helpers to init
        const { input: searchInput } = createSearchBar(promptTextarea, negPromptTextarea, tabName);

        createBubbleContainer(promptTextarea, false);
        createBubbleContainer(negPromptTextarea, true);

        // Helper: Calculate Weight (Scoped or Global? It's pure logic, can stay global or here. 
        // Since it's pure, let's keep it here or move it out if needed. 
        // It's used by createBubbleElement. 
        // createBubbleElement is defined OUTSIDE setupTab? 
        // Wait, createBubbleElement was defined OUTSIDE in original.
        // But createBubbleElement is called by createBubbleContainer.
        // createBubbleContainer is defined outside? No, I need to check where I put createBubbleContainer.

        // In my plan, I need to be careful about scope.
        // createBubbleContainer WAS defined inside onUiLoaded.
        // createBubbleElement WAS defined inside onUiLoaded.
        // If I keep them inside onUiLoaded but OUTSIDE setupTab, they are fine.

    } // End setupTab

    // -------------------------------------------------------------------------
    // Init All Tabs
    // -------------------------------------------------------------------------
    ['txt2img', 'img2img'].forEach(tab => setupTab(tab));


    // Helper: Calculate Weight
    function calculateWeight(token) {
        let text = token;
        let roundCount = 0;
        let squareCount = 0;

        // Iteratively peel brackets/parens
        while (true) {
            if (text.startsWith('(') && text.endsWith(')')) {
                roundCount++;
                text = text.substring(1, text.length - 1);
            } else if (text.startsWith('[') && text.endsWith(']')) {
                squareCount++;
                text = text.substring(1, text.length - 1);
            } else {
                break;
            }
        }

        let explicitVal = null;
        let value = 1.0;
        let syntax = roundCount > 0 ? 'round' : (squareCount > 0 ? 'square' : 'plain');

        // Check for explicit value :1.2
        const lastColon = text.lastIndexOf(":");
        if (lastColon !== -1) {
            const possibleVal = text.substring(lastColon + 1);
            if (!isNaN(parseFloat(possibleVal))) {
                explicitVal = parseFloat(possibleVal);
                text = text.substring(0, lastColon);

                // Base is explicit.
                // Subtract one round bracket from multiplier if it was used for syntax `(tag:val)`
                let effectiveRounds = roundCount;
                if (effectiveRounds > 0) effectiveRounds--;

                value = explicitVal * Math.pow(1.1, effectiveRounds) * Math.pow(0.9, squareCount);
            } else {
                // Colon exists but not a number (e.g. invalid)
                value = Math.pow(1.1, roundCount) * Math.pow(0.9, squareCount);
            }
        } else {
            value = Math.pow(1.1, roundCount) * Math.pow(0.9, squareCount);
        }

        return { text, value, syntax, explicitVal, depth: roundCount + squareCount };
    }

    // createBubbleContainer(promptTextarea, false);
    // createBubbleContainer(negPromptTextarea, true);
    // Moved to setupTab

    // -------------------------------------------------------------------------
    // Dictionary Editor Modal (v5.7.0)
    // -------------------------------------------------------------------------
    function createDictionaryEditorModal() {
        const overlay = document.createElement("div");
        overlay.className = "prompt-bubbles-settings-overlay";
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
            backgroundColor: "rgba(0,0,0,0.6)", zIndex: "10000", display: "flex",
            justifyContent: "center", alignItems: "center"
        });

        const modal = document.createElement("div");
        modal.className = "prompt-bubbles-dict-editor-modal";

        // --- Header ---
        const header = document.createElement("div");
        header.className = "dict-editor-header";
        const title = document.createElement("h3");
        title.textContent = "개인 사전 편집기";
        const closeBtn = document.createElement("span");
        closeBtn.textContent = "×";
        closeBtn.className = "dict-editor-close";
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // --- Content Container ---
        const container = document.createElement("div");
        container.className = "dict-editor-container";

        // 1. Tag Input (Search)
        const tagGroup = document.createElement("div");
        tagGroup.className = "dict-input-group";
        const tagLabel = document.createElement("label");
        tagLabel.textContent = "태그 (Tag)";
        const tagInput = document.createElement("input");
        tagInput.type = "text";
        tagInput.placeholder = "태그 검색 또는 입력...";
        tagInput.className = "dict-editor-input";

        // Autocomplete List for Tag
        const resultsList = document.createElement("ul");
        resultsList.className = "prompt-bubbles-list";
        resultsList.style.position = "absolute";
        resultsList.style.width = "100%";
        resultsList.style.display = "none";
        resultsList.style.zIndex = "100";
        resultsList.style.maxHeight = "200px";
        resultsList.style.overflowY = "auto";
        resultsList.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";

        tagGroup.appendChild(tagLabel);
        tagGroup.appendChild(tagInput);
        tagGroup.appendChild(resultsList); // Needs relative parent

        // 2. Attributes Row
        const attrRow = document.createElement("div");
        attrRow.className = "dict-attr-row";

        // Pref Input
        const prefGroup = document.createElement("div");
        prefGroup.className = "dict-input-group";
        prefGroup.style.flex = "1";
        const prefLabel = document.createElement("label");
        prefLabel.textContent = "선호도 (Pref)";
        const prefInput = document.createElement("input");
        prefInput.type = "text";
        prefInput.placeholder = "0";
        prefInput.className = "dict-editor-input";
        prefGroup.appendChild(prefLabel);
        prefGroup.appendChild(prefInput);

        // Translation Input
        const transGroup = document.createElement("div");
        transGroup.className = "dict-input-group";
        transGroup.style.flex = "2";
        const transLabel = document.createElement("label");
        transLabel.textContent = "번역/텍스트 (Entry)";
        const transInput = document.createElement("input");
        transInput.type = "text";
        transInput.placeholder = "번역 입력 (비우면 Pref만 수정)";
        transInput.className = "dict-editor-input";
        transGroup.appendChild(transLabel);
        transGroup.appendChild(transInput);

        attrRow.appendChild(prefGroup);
        attrRow.appendChild(attrRow.ownerDocument.createElement("div")).style.width = "10px"; // Spacer
        attrRow.appendChild(transGroup);

        container.appendChild(tagGroup);
        container.appendChild(attrRow);

        // --- Actions ---
        const actionRow = document.createElement("div");
        actionRow.className = "dict-action-row";

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "저장 (Save)";
        saveBtn.className = "prompt-bubbles-btn primary";

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "삭제 (Delete)";
        deleteBtn.className = "prompt-bubbles-btn danger";
        deleteBtn.style.marginLeft = "10px";
        deleteBtn.style.backgroundColor = "#ef4444"; // Red
        deleteBtn.style.color = "white";

        const statusMsg = document.createElement("span");
        statusMsg.style.fontSize = "0.9em";
        statusMsg.style.marginLeft = "10px";
        statusMsg.style.color = "#64748b";

        actionRow.appendChild(saveBtn);
        actionRow.appendChild(deleteBtn);
        actionRow.appendChild(statusMsg);
        container.appendChild(actionRow);

        // --- Help Text ---
        const helpBox = document.createElement("div");
        helpBox.className = "dict-help-box";
        helpBox.innerHTML = `
            <strong>💡 사용법:</strong><br>
            - <strong>태그 검색</strong>: 태그를 입력하면 사전에 있는 정보를 불러옵니다.<br>
            - <strong>수정 (Save)</strong>: 값을 입력하고 저장을 누르세요.<br>
            - <strong>부분 수정</strong>: '번역' 칸을 비워두면 <strong>선호도(Pref)</strong>만 업데이트됩니다.<br>
            - <strong>삭제 (Delete)</strong>: 삭제 버튼을 누르면 해당 태그가 삭제됩니다.
        `;
        container.appendChild(helpBox);

        modal.appendChild(container);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // --- Logic ---

        // 1. Tag Autocomplete
        tagInput.addEventListener("input", function () {
            const query = this.value.toLowerCase().trim();
            resultsList.innerHTML = "";
            if (query.length < 1) {
                resultsList.style.display = "none";
                return;
            }

            const matches = [];
            // Only search in Dictionary as per user request (v5.7.1)
            Object.keys(dictionary).forEach(key => {
                if (key.toLowerCase().includes(query)) {
                    matches.push({ tag: key, from: 'dict' });
                }
            });

            // Sort matches: starts with query first, then alphabetical
            matches.sort((a, b) => {
                const aStarts = a.tag.toLowerCase().startsWith(query);
                const bStarts = b.tag.toLowerCase().startsWith(query);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return a.tag.localeCompare(b.tag);
            });

            if (matches.length > 0) {
                resultsList.style.display = "block";
                matches.forEach(m => {
                    const li = document.createElement("li");
                    li.textContent = m.tag; // No need for "(사전)" suffix if only dict items
                    li.style.fontWeight = "bold";

                    li.onclick = () => {
                        tagInput.value = m.tag;
                        resultsList.style.display = "none";
                        if (dictionary[m.tag]) {
                            const entry = dictionary[m.tag];
                            if (typeof entry === 'string') {
                                transInput.value = entry;
                                prefInput.value = "0";
                            } else {
                                transInput.value = entry.translation || "";
                                prefInput.value = entry.preference || "0";
                            }
                            statusMsg.textContent = "데이터를 불러왔습니다.";
                        }
                    };
                    resultsList.appendChild(li);
                });
            } else {
                resultsList.style.display = "none";
            }
        });

        tagInput.addEventListener("blur", () => setTimeout(() => resultsList.style.display = "none", 200));

        // 2. Save Logic
        saveBtn.onclick = async () => {
            const tag = tagInput.value.trim();
            const prefStr = prefInput.value.trim();
            const trans = transInput.value.trim();

            if (!tag) {
                alert("태그를 입력해주세요.");
                return;
            }

            saveBtn.disabled = true;
            deleteBtn.disabled = true;
            statusMsg.textContent = "저장 중...";

            let entry = null;

            // Partial Update: Trans Empty -> Keep existing Trans
            if (!trans && dictionary[tag]) {
                let existingTrans = "";
                if (typeof dictionary[tag] === 'string') existingTrans = dictionary[tag];
                else existingTrans = dictionary[tag].translation || "";

                entry = {
                    translation: existingTrans,
                    preference: parseInt(prefStr) || 0
                };
            } else {
                entry = {
                    translation: trans,
                    preference: parseInt(prefStr) || 0
                };
            }

            // If explicit empty save, allow it? existing logic allowed save even if empty.
            // We removed implicit delete (entry=null), so entry will be {translation:"", preference:0} if both empty.
            // That's fine, it just saves an empty translation/preference.

            try {
                const response = await fetch("/prompt_bubbles/save_dict", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tag, entry })
                });
                const result = await response.json();

                if (result.success) {
                    statusMsg.textContent = "저장 완료!";
                    statusMsg.style.color = "green";
                    if (result.dictionary) dictionary = result.dictionary;

                    setTimeout(() => {
                        saveBtn.disabled = false;
                        deleteBtn.disabled = false;
                        statusMsg.textContent = "";
                        statusMsg.style.color = "#64748b";
                    }, 1500);
                } else {
                    statusMsg.textContent = "실패: " + (result.error || "오류");
                    statusMsg.style.color = "red";
                    saveBtn.disabled = false;
                    deleteBtn.disabled = false;
                }
            } catch (e) {
                statusMsg.textContent = "통신 오류";
                statusMsg.style.color = "red";
                saveBtn.disabled = false;
                deleteBtn.disabled = false;
                console.error(e);
            }
        };

        // 3. Delete Logic (New v5.7.3)
        deleteBtn.onclick = async () => {
            const tag = tagInput.value.trim();
            if (!tag) {
                alert("삭제할 태그를 입력하거나 선택해주세요.");
                return;
            }

            if (!confirm(`'${tag}' 태그를 사전에서 삭제하시겠습니까?`)) return;

            deleteBtn.disabled = true;
            saveBtn.disabled = true;
            statusMsg.textContent = "삭제 중...";

            try {
                // Send entry: null to trigger deletion in backend
                const response = await fetch("/prompt_bubbles/save_dict", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tag, entry: null })
                });
                const result = await response.json();

                if (result.success) {
                    statusMsg.textContent = "삭제 완료!";
                    statusMsg.style.color = "green";
                    if (result.dictionary) dictionary = result.dictionary;

                    setTimeout(() => {
                        deleteBtn.disabled = false;
                        saveBtn.disabled = false;
                        statusMsg.textContent = "";
                        statusMsg.style.color = "#64748b";
                        // Clear inputs on delete
                        tagInput.value = ""; prefInput.value = "0"; transInput.value = "";
                    }, 1500);
                } else {
                    statusMsg.textContent = "삭제 실패: " + (result.error || "오류");
                    statusMsg.style.color = "red";
                    deleteBtn.disabled = false;
                    saveBtn.disabled = false;
                }
            } catch (e) {
                statusMsg.textContent = "통신 오류";
                statusMsg.style.color = "red";
                deleteBtn.disabled = false;
                saveBtn.disabled = false;
                console.error(e);
            }
        };
    }
});
