
import modules.scripts as scripts
import gradio as gr
import os
import json
import requests
import re
import csv
from modules import script_callbacks
from fastapi import FastAPI, Request

# Store tags in memory
loaded_tags = []

def load_file(path, color=None):
    tags = []
    encodings = ['utf-8', 'cp949', 'euc-kr', 'latin-1']
    
    for encoding in encodings:
        try:
            with open(path, 'r', encoding=encoding) as f:
                reader = csv.reader(f)
                temp_tags = []
                for row in reader:
                    if len(row) < 1: continue
                    
                    # A: Tag (Required)
                    tag = row[0].strip()
                    if not tag: continue
                    
                    count = 0
                    aliases = ""
                    
                    # B: Type (Skip)
                    
                    # C: Count OR Category
                    # User format: A=Tag, B=Empty, C=Category(Str), D=Translation(Str)
                    # Standard: A=Tag, B=Type, C=Count(Int), D=Aliases(Str)
                    
                    if len(row) >= 3:
                        c_col = row[2].strip()
                        if c_col.isdigit():
                            count = int(c_col)
                        # If not digit, it's likely category or other text. 
                        # We ignore category for count, but maybe we can append it to aliases?
                        # For now, just keep count as 0.

                    # D: Aliases OR Translation
                    if len(row) >= 4:
                        aliases = row[3].strip()

                    # E: Extra info (Custom)
                    extra = ""
                    if len(row) >= 5:
                        extra = row[4].strip()
                        
                    tag_data = {
                        "tag": tag,
                        "count": count,
                        "aliases": aliases,
                        "extra": extra
                    }
                    if color:
                        tag_data["color"] = color
                    temp_tags.append(tag_data)
                
                print(f"[Prompt Bubbles] Loaded {len(temp_tags)} tags from {os.path.basename(path)} ({encoding})")
                return temp_tags
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"[Prompt Bubbles] Error loading {path} with {encoding}: {e}")
            
    print(f"[Prompt Bubbles] Failed to load {path} with any encoding.")
    return []

def load_tags_from_csv():
    global loaded_tags
    if loaded_tags:
        return

    script_path = os.path.abspath(__file__)
    ext_root = os.path.dirname(os.path.dirname(script_path))
    
    new_tags = []

    # 1. Load tags.csv (default)
    csv_path = os.path.join(ext_root, "tags.csv")
    if os.path.exists(csv_path):
        new_tags.extend(load_file(csv_path))
    else:
        print(f"[Prompt Bubbles] tags.csv not found at {csv_path}")

    # 2. Scan for tags_*.csv
    try:
        for filename in os.listdir(ext_root):
            if filename.startswith("tags_") and filename.endswith(".csv"):
                color = filename[5:-4] # Remove 'tags_' and '.csv'
                full_path = os.path.join(ext_root, filename)
                new_tags.extend(load_file(full_path, color))
    except Exception as e:
        print(f"[Prompt Bubbles] Error scanning for tag files: {e}")
            
    # Sort by count desc
    new_tags.sort(key=lambda x: x["count"], reverse=True)
    loaded_tags = new_tags
    print(f"[Prompt Bubbles] Total loaded tags: {len(loaded_tags)}")

class PromptBubblesScript(scripts.Script):
    def title(self):
        return "Prompt Bubbles"

    def show(self, is_img2img):
        return scripts.AlwaysVisible

    def ui(self, is_img2img):
        enabled = gr.Checkbox(label="Enable Prompt Bubbles", value=True, elem_id="prompt_bubbles_enabled")
        
        # Load dictionary from file (Extension Root)
        script_path = os.path.abspath(__file__)
        ext_root = os.path.dirname(os.path.dirname(script_path))
        dict_path = os.path.join(ext_root, "prompt_bubbles_dict.json")
        
        initial_dictionary = {}
        if os.path.exists(dict_path):
            try:
                with open(dict_path, 'r', encoding='utf-8') as f:
                    initial_dictionary = json.load(f)
            except Exception as e:
                print(f"Error loading prompt bubbles dictionary: {e}")
        
        dictionary_data = gr.HTML(value=f"<div id='prompt_bubbles_dict_data' data-dictionary='{json.dumps(initial_dictionary)}'></div>", visible=False)

        return [enabled, dictionary_data]

    def before_process(self, p, enabled, dictionary_data):
        if not enabled:
            return
            
        print("[Prompt Bubbles] Cleaning prompt (removing translations) in before_process")

        def expand_groups(text):
            if not text: return text
            # Find __content__ and replace / with , 
            def replace_group(match):
                content = match.group(1)
                return content.replace('/', ', ')
            # Regex for !!...!! (non-greedy)
            return re.sub(r'!!(.+?)!!', replace_group, text)
            
        # v6.0.0 Change: Regex to remove translation (supports @@...@@ only)
        # Note: Non-greedy match
        translation_regex = r'(\@{2}.*?\@{2})'

        if p.prompt:
            p.prompt = expand_groups(p.prompt)
            p.prompt = re.sub(translation_regex, '', p.prompt, flags=re.DOTALL)
        if p.negative_prompt:
            p.negative_prompt = expand_groups(p.negative_prompt)
            p.negative_prompt = re.sub(translation_regex, '', p.negative_prompt, flags=re.DOTALL)
        if p.all_prompts:
            p.all_prompts = [re.sub(translation_regex, '', expand_groups(prompt), flags=re.DOTALL) for prompt in p.all_prompts]
        if p.all_negative_prompts:
            p.all_negative_prompts = [re.sub(r'@@.*?@@', '', expand_groups(prompt), flags=re.DOTALL) for prompt in p.all_negative_prompts]

def prompt_bubbles_api(_: gr.Blocks, app: FastAPI):
    # Load tags on startup (background)
    load_tags_from_csv()

    @app.get("/prompt_bubbles/search_tags")
    async def search_tags(query: str = "", limit: int = 50, force_reload: bool = False):
        if force_reload:
            global loaded_tags
            loaded_tags = []
            load_tags_from_csv()

        if not query:
            return []
        
        query = query.lower()
        query_norm = query.replace(" ", "_")
        results = []
        count = 0
        
        # global loaded_tags
        # Ensure loaded ?
        if not loaded_tags:
            load_tags_from_csv()
            
        for item in loaded_tags:
            if count >= limit:
                break
            
            # Normalize fields for comparison (treat spaces as underscores)
            tag_norm = item["tag"].lower().replace(" ", "_")
            aliases_norm = item["aliases"].lower().replace(" ", "_")
            extra_norm = item.get("extra", "").lower().replace(" ", "_")
            
            # Simple contains check with normalization
            if (query_norm in tag_norm or 
                query_norm in aliases_norm or 
                query_norm in extra_norm):
                # Highlight logic or just return raw?
                # Return object
                results.append(item)
                count += 1
                
        return results

    @app.post("/prompt_bubbles/reload_tags")
    async def reload_tags_api():
        try:
            global loaded_tags
            loaded_tags = []
            load_tags_from_csv()
            return {"success": True, "count": len(loaded_tags)}
        except Exception as e:
            return {"error": str(e)}

    @app.post("/prompt_bubbles/translate")
    async def translate_tag(request: Request):
        data = await request.json()
        text = data.get("text", "")
        target_lang = data.get("tl", "ko") # Default to Korean if not provided
        if not text:
            return {"translation": ""}
        
        try:
            # Google Translate GTX endpoint (POST)
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={target_lang}&dt=t"
            response = requests.post(url, data={"q": text})
            if response.status_code == 200:
                result = response.json()
                translation = ""
                if result and isinstance(result, list) and len(result) > 0:
                    for sentence in result[0]:
                        if sentence and len(sentence) > 0:
                            translation += sentence[0]
                return {"translation": translation}
        except Exception as e:
            print(f"Translation error: {e}")
            return {"error": str(e)}
        
        return {"translation": ""}

    @app.get("/prompt_bubbles/all_tags")
    async def get_all_tags():
        if not loaded_tags:
            load_tags_from_csv()
            
        # Filter minimal data: t=tag, a=aliases
        data = [{"t": item["tag"], "a": item.get("aliases", "")} for item in loaded_tags]
        return data

    @app.post("/prompt_bubbles/save_dict")
    async def save_dict(request: Request):
        data = await request.json()
        tag = data.get("tag")
        entry = data.get("entry")
        
        if not tag:
            return {"error": "Invalid data: Tag is missing"}
            
        try:
            # Extension root path for dictionary
            script_path = os.path.abspath(__file__)
            ext_root = os.path.dirname(os.path.dirname(script_path))
            dict_path = os.path.join(ext_root, "prompt_bubbles_dict.json")
            
            print(f"[Prompt Bubbles] Saving Entry: {tag} -> {entry}")
            print(f"[Prompt Bubbles] Target Path: {dict_path}")
            
            current_dict = {}
            if os.path.exists(dict_path):
                try:
                    with open(dict_path, 'r', encoding='utf-8') as f:
                        current_dict = json.load(f)
                except Exception as e:
                    print(f"[Prompt Bubbles] Read Error: {e}")
            
            # Dictionary format: { "tag": { "translation": "...", "preference": 0 } }
            if entry is None:
                if tag in current_dict:
                    del current_dict[tag]
                    print(f"[Prompt Bubbles] Deleted tag: {tag}")
            else:
                current_dict[tag] = entry
            
            with open(dict_path, 'w', encoding='utf-8') as f:
                json.dump(current_dict, f, ensure_ascii=False, indent=4)
            
            print(f"[Prompt Bubbles] Save Success!")
            return {"success": True, "dictionary": current_dict, "path": dict_path}
            
        except Exception as e:
            print(f"[Prompt Bubbles] Save Error: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e), "path": str(dict_path) if 'dict_path' in locals() else "Unknown"}

    @app.post("/prompt_bubbles/reload_dict")
    async def reload_dict(request: Request):
        try:
            # Extension root path for dictionary
            script_path = os.path.abspath(__file__)
            ext_root = os.path.dirname(os.path.dirname(script_path))
            dict_path = os.path.join(ext_root, "prompt_bubbles_dict.json")
            
            print(f"[Prompt Bubbles] Reloading from: {dict_path}")
            
            current_dict = {}
            if os.path.exists(dict_path):
                with open(dict_path, 'r', encoding='utf-8') as f:
                    current_dict = json.load(f)
            else:
                print(f"[Prompt Bubbles] File not found at {dict_path}")
                
            return {"success": True, "dictionary": current_dict, "path": dict_path}
        except Exception as e:
            print(f"[Prompt Bubbles] Reload Error: {e}")
            return {"error": str(e)}

script_callbacks.on_app_started(prompt_bubbles_api)
