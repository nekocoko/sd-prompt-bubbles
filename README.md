[한국어 문서 (Korean)](#korean-documentation) | [English Documentation](#english-documentation)

<a name="korean-documentation"></a>
## 🇰🇷 Korean Documentation

# Prompt Bubbles for Stable Diffusion WebUI
> **⚠️** <br>
> 이 프로젝트는 개인적으로 사용하던 도구를 정리해 공개한 것입니다.  
> 코드의 대부분은 AI를 사용해 제작하였습니다.  
> 테스트는 `webui_forge_cu124_torch24`를 기반으로 한 제한적인 환경에서만 진행되었으며,  
> 모든 환경에서의 정상 동작을 보장하지 않습니다.  
> 유지보수 및 지원은 보장하지 않습니다.  
> 사용에 따른 문제나 손해에 대해 책임지지 않습니다.  
> 필요에 따라 자유롭게 포크·수정하여 사용하셔도 됩니다.

Stable Diffusion WebUI에서 사용하는 텍스트 기반 프롬프트를 시각적인 ‘버블 UI’ 형태로 변환하여,<br>
복잡한 프롬프트를 보다 직관적으로 확인·편집·정리할 수 있도록 도와주는 확장 도구입니다.<br>
드래그 앤 드롭 정렬, 긍정/부정 프롬프트 분리 관리, 번역 및 자동 완성 등 프롬프트 관리에 필요한 기능을 제공합니다.<br>

---

### 주요 기능
- **프롬프트 버블 시각화**: 복잡한 프롬프트를 개별 버블로 표시하여 한눈에 파악하기 쉽게 만듭니다.
- **다국어 번역 지원**: Google 번역을 통해 태그를 간단하게 번역합니다. 설정에서 번역 언어(한국어, 일본어, 영어 등)를 선택할 수 있습니다.
- **스마트 안전장치**: LoRA 태그(`<...>`) 및 임베딩 보호 기능과 다이나믹 프롬프트(`{a|b|c}`) 호환성을 지원합니다.
- **정렬 및 편집**: 드래그 앤 드롭으로 순서를 바꾸고, 클릭하여 즉시 수정하며, 우클릭을 통해 긍정/부정 프롬프트 간 이동이 가능합니다.
- **개인 사전 기능**: 자주 사용하는 태그를 번역과 함께 사전에 저장하고 검색할 수 있습니다.
- **태그 검색 기능**: 기존 태그 자동 완성 기능과 호환되지 않기 때문에 CSV 파일을 통해 태그 검색 기능을 별도로 지원합니다.

### 설치 방법
1. WebUI의 `Extensions` 탭으로 이동합니다.
2. `Install from URL`을 클릭합니다.
3. 이 저장소의 URL을 입력하고 `Install`을 누릅니다.
4. `Apply and restart UI`를 클릭하여 적용합니다.

### 사용 방법
- **편집**: 버블을 클릭하여 내용을 수정합니다.
- **삭제**: 버블 내의 `×` 버튼을 누르거나 선택 후 `Delete` 키를 누릅니다.
- **이동**: 버블을 우클릭하여 프롬프트와 부정 프롬프트 사이를 이동시킵니다.
- **정렬**: 버블을 원하는 위치로 드래그 앤 드롭합니다. 쉬프트, 알트, 컨트롤 등의 키로 다중 선택 후 이동이 가능합니다.
- **번역**: 상단 도구 바의 `Translate` 버튼을 눌러 전체 프롬프트를 번역합니다.

---

### 버블 스타일
<img width="790" height="358" alt="스크린샷 2026-02-23 151551" src="https://github.com/user-attachments/assets/ee574712-225c-4f21-b076-30b00374f101" /><br>
<br>
<br>
<br>
<img width="200" height="30" alt="스크린샷 2026-02-23 161410" src="https://github.com/user-attachments/assets/68a4158e-22a7-4b6e-8d37-e3803d4d2d06" /><br>
**일반 태그**

<img width="183" height="33" alt="스크린샷 2026-02-23 153304" src="https://github.com/user-attachments/assets/564309e9-0ed1-4f57-ac49-507d5a8a2f02" /><br>
**가중치 태그** : ()는 노란색 버블, []는 회색 버블로 표시됩니다.

<img width="297" height="35" alt="스크린샷 2026-02-23 151501" src="https://github.com/user-attachments/assets/982b1917-18e1-4355-8d62-9220ff7d7c4a" /><br>
**자동 완성 태그 등록 태그** : CSV 파일로 등록한 태그와 정확히 일치하는 태그 버블은 파란색 테두리가 표시됩니다.

<img width="108" height="41" alt="스크린샷 2026-02-23 151850" src="https://github.com/user-attachments/assets/4b399e1e-7292-450c-ad64-355485c7f94d" /><br>
**개인 사전 등록 태그** : 개인 사전에 등록한 태그와 정확히 일치하는 태그 버블은 우측 상단에 *표가 표시됩니다.

<img width="60" height="35" alt="스크린샷 2026-02-23 152037" src="https://github.com/user-attachments/assets/acddfacc-80bd-4654-addc-b08dcccb7801" /><br>
**비표준 태그** : CSV 파일로 등록한 태그에서 표준 태그가 있는 비표준 태그 버블은 보라색 테두리가 표시됩니다. (예. `male`(비표준) > `1boy`(표준))

<img width="208" height="34" alt="스크린샷 2026-02-23 152716" src="https://github.com/user-attachments/assets/94f3b921-1607-4e56-83f1-57a38a00d572" /><br>
**언더바(_) 미적용 태그** : CSV 파일로 등록한 태그에서 언더바(_) 대신 스페이스바가 적용된 태그 버블은 노란색 테두리가 표시됩니다.

<img width="200" height="40" alt="스크린샷 2026-02-23 152416" src="https://github.com/user-attachments/assets/ea14c5ef-834c-453d-ae17-f8ff4def4ac0" /><br>
**다이나믹 프롬프트 태그** : 다이나믹 프롬프트 태그는 실선 테두리 버블로 묶입니다. 내부 개별 태그는 스타일 영향을 받지 않습니다.

<img width="166" height="34" alt="스크린샷 2026-02-23 152847" src="https://github.com/user-attachments/assets/5fc5cb90-0afe-44c1-87a6-e7c08c15e255" /><br>
**LoRA 태그** : LoRA 태그는 보라색 버블로 표시됩니다. 번역 기능에 포함되지 않습니다.

<img width="166" height="33" alt="스크린샷 2026-02-23 153436" src="https://github.com/user-attachments/assets/13ae0768-bd74-4d13-a2d6-ebf38e7478b8" /><br>
**중복 태그** : 중복된 태그는 가장 앞에 위치한 태그를 제외하고는 빨간색 버블로 표시됩니다.

<img width="198" height="35" alt="스크린샷 2026-02-23 155750" src="https://github.com/user-attachments/assets/289cb30e-85c0-4681-867b-a87a7f7272b9" /><br>
**묶음 태그** : 가독성을 위한 묶음 태그입니다. 주로 개인 사전에 여러 개의 태그를 한 번에 등록한 후 사전을 통해 입력했을 때 생성됩니다.<br>
'`!!a/b/c/d!!`' 형식을 띠고 있지만, 이미지 생성 시 '`a,b,c,d`'로 자동 변환됩니다.
<br><br><br><br><br>

## 편의 기능

### 번역 기능
- Google 번역을 통해 태그를 간단하게 번역합니다. 설정에서 번역 언어(한국어, 일본어, 영어 등)를 선택할 수 있습니다.
- 번역이 적용된 상태에서 생성을 시도할 경우, 태그에서 자동으로 번역문을 제거합니다.
- '번역 지우기' 버튼을 통해 번역을 지울 수도 있습니다.

### 정렬 및 편집
- 드래그 앤 드롭으로 순서를 바꾸고, 클릭하여 즉시 수정하며, 우클릭을 통해 긍정/부정 프롬프트 간 이동이 가능합니다.
- 우클릭으로 태그 개별 복사가 가능합니다.
- 쉬프트, 알트, 컨트롤 등의 키로 버블을 다중 선택 후 이동이 가능합니다.
- 그룹 버블(다이나믹 프롬프트) 내부와 외부 이동이 가능합니다.
- 가중치가 없는 태그를 클릭으로 수정할 때, 괄호로 감싸지 않고 수치만 입력하면 자동으로 괄호가 적용됩니다.<br>
(예. `tag` → `tag:1.2`만 입력해도 자동으로 `(tag:1.2)`로 수정됩니다.)

### 개인 사전 기능
- 자주 사용하는 태그를 번역과 함께 사전에 저장하고 검색할 수 있습니다.
- 저장한 태그는 `extensions\sd-prompt-bubbles\prompt_bubbles_dict.json`에 저장됩니다.
- 여러 개의 태그를 한 번에 저장할 수 있습니다. 저장한 태그를 프롬프트에 불러올 경우 묶음 태그 버블로 표시됩니다.

### 태그 검색 기능
기존 태그 자동 완성 기능과 호환되지 않기 때문에 별도로 태그 검색 기능을 지원합니다.<br>
`extensions\sd-prompt-bubbles` 경로에 기존 태그 자동 완성용 CSV 파일을 `tags.csv`로 이름을 변경하여 넣으면 태그 사전에 적용할 수 있습니다.<br>

개인 태그 파일을 넣으면 추가 검색이 가능합니다. 적용법은 다음과 같습니다.
- `tags_*.csv` 형식의 파일명으로 저장하여 `extensions\sd-prompt-bubbles` 경로에 넣습니다.<br>
`tags_`와 `.csv` 사이의 문자열을 CSS 색상 값으로 그대로 사용하여, 검색 시 기존 자동 완성 태그와 색상으로 구별이 가능합니다.
- 적용 가능한 형식은 다음과 같습니다.<br>
CSS에서 인식 가능한 거의 모든 색상 형식을 파일명에 사용할 수 있습니다.<br><br>
**Hex Code**: `tags_#ff0000.csv` (빨간색)<br>
**Color Name**: `tags_blue.csv`, `tags_orange.csv` 등<br>
**RGB** : `tags_rgb(255,0,0).csv` 같은 형식은 괄호나 쉼표가 파일명에 들어갈 수 있는 환경(Windows 등)이라면 작동은 하겠지만, 가독성과 안정성을 위해 Hex Code나 Color Name을 권장합니다.
  
- 요약 : `#059669` 같은 헥사 코드 외에도 `red, blue, green` 같은 색상 이름을 파일명에 넣어서 사용할 수 있습니다. 브라우저가 인식하는 표준 CSS 색상 이름이라면 모두 적용됩니다.

CSV 열 구조
- **첫 번째 열** (row[0]): 태그 원문 (Tag)<br>
필수 값입니다. 이 값이 비어 있으면 해당 줄은 건너뜁니다.
- **두 번째 열** (row[1]): 유형 (Type)<br>
현재 코드상에서는 읽기만 하고 별도로 저장하거나 사용하지 않고 건너뜁니다.
- **세 번째 열** (row[2]): 개수(Count) 또는 카테고리<br>
값이 숫자인 경우: 태그의 사용 빈도(Count)로 인식하여 저장합니다. (검색 결과 정렬 시 사용됩니다)<br>
값이 문자열인 경우: 카테고리 등으로 간주하며, 개수는 0으로 처리됩니다.
- **네 번째 열** (row[3]): 별칭(Aliases) 또는 번역<br>
태그의 유사어나 번역어 데이터가 들어가는 자리입니다. 검색 시 이 열에 포함된 단어로도 태그를 찾을 수 있습니다.
- **다섯 번째 열** (row[4]): 추가 정보 (Extra info)<br>
태그에 대한 보충 설명이 있다면 이 열에 기입합니다. 검색 결과 리스트에서 작은 글씨로 표시됩니다.

---
<a name="english-documentation"></a>
## 🇺🇸 English Documentation

# Prompt Bubbles for Stable Diffusion WebUI
> **⚠️** <br>
> This project is a cleaned-up version of a tool originally made for personal use.  
> Most of the code was generated with the help of AI.  
> Testing was conducted only in a limited environment based on `webui_forge_cu124_torch24`,  
> and proper operation in all environments is not guaranteed.  
> Ongoing maintenance and support are not guaranteed.  
> The author is not responsible for any issues or damages resulting from the use of this tool.  
> You are free to fork and modify this project as needed.

This extension converts the text-based prompts used in Stable Diffusion WebUI into a visual “bubble UI”,<br>
helping you view, edit, and organize complex prompts in a more intuitive way.<br>
It provides useful prompt management features such as drag-and-drop sorting, separation of positive/negative prompts, translation, and auto-completion.<br>

---

### Key Features
- **Prompt Bubble Visualization**: Displays complex prompts as individual bubbles for easy readability.
- **Multi-language Translation**: Easily translate tags using Google Translate. You can select the target language (Korean, Japanese, English, etc.) in the settings.
- **Smart Safeguards**: Supports protection for LoRA tags (`<...>`) and embeddings, and is compatible with dynamic prompts (`{a|b|c}`).
- **Sorting & Editing**: Reorder bubbles via drag and drop, edit them instantly by clicking, and move tags between positive/negative prompts via right-click.
- **Personal Dictionary**: Save frequently used tags with translations and search them easily.
- **Tag Search**: Since it is not compatible with the default tag autocomplete feature, a separate tag search feature is provided via CSV files.

### Installation
1. Go to the `Extensions` tab in WebUI.
2. Click `Install from URL`.
3. Enter the URL of this repository and click `Install`.
4. Click `Apply and restart UI` to apply the extension.

### How to Use
- **Edit**: Click a bubble to edit its content.
- **Delete**: Click the `×` button inside a bubble or select it and press the `Delete` key.
- **Move**: Right-click a bubble to move it between positive and negative prompts.
- **Sort**: Drag and drop bubbles to reorder them. You can multi-select bubbles using Shift, Alt, or Ctrl.
- **Translate**: Click the `Translate` button in the top toolbar to translate the entire prompt.

---

### Bubble Styles
<img width="790" height="358" alt="Screenshot 2026-02-23 151551" src="https://github.com/user-attachments/assets/ee574712-225c-4f21-b076-30b00374f101" /><br>
<br>
<br>
<br>
<img width="200" height="30" alt="Screenshot 2026-02-23 161410" src="https://github.com/user-attachments/assets/68a4158e-22a7-4b6e-8d37-e3803d4d2d06" /><br>
**Normal Tags**

<img width="183" height="33" alt="Screenshot 2026-02-23 153304" src="https://github.com/user-attachments/assets/564309e9-0ed1-4f57-ac49-507d5a8a2f02" /><br>
**Weighted Tags**: `()` are displayed as yellow bubbles, `[]` as gray bubbles.

<img width="297" height="35" alt="Screenshot 2026-02-23 151501" src="https://github.com/user-attachments/assets/982b1917-18e1-4355-8d62-9220ff7d7c4a" /><br>
**Autocomplete Registered Tags**: Bubbles that exactly match tags registered via CSV files are shown with a blue border.

<img width="108" height="41" alt="Screenshot 2026-02-23 151850" src="https://github.com/user-attachments/assets/4b399e1e-7292-450c-ad64-355485c7f94d" /><br>
**Personal Dictionary Tags**: Bubbles that exactly match tags registered in the personal dictionary display an asterisk (*) at the top-right corner.

<img width="60" height="35" alt="Screenshot 2026-02-23 152037" src="https://github.com/user-attachments/assets/acddfacc-80bd-4654-addc-b08dcccb7801" /><br>
**Non-standard Tags**: Bubbles for non-standard tags that have corresponding standard tags in the CSV file are displayed with a purple border. (e.g., `male` (non-standard) > `1boy` (standard))

<img width="208" height="34" alt="Screenshot 2026-02-23 152716" src="https://github.com/user-attachments/assets/94f3b921-1607-4e56-83f1-57a38a00d572" /><br>
**Tags Without Underscores (_)**: Bubbles for tags where spaces are used instead of underscores (_) are shown with a yellow border.

<img width="200" height="40" alt="Screenshot 2026-02-23 152416" src="https://github.com/user-attachments/assets/ea14c5ef-834c-453d-ae17-f8ff4def4ac0" /><br>
**Dynamic Prompt Tags**: Dynamic prompt groups are wrapped in solid-line bordered bubbles. Inner tags are not affected by styling.

<img width="166" height="34" alt="Screenshot 2026-02-23 152847" src="https://github.com/user-attachments/assets/5fc5cb90-0afe-44c1-87a6-e7c08c15e255" /><br>
**LoRA Tags**: LoRA tags are displayed as purple bubbles and are excluded from translation.

<img width="166" height="33" alt="Screenshot 2026-02-23 153436" src="https://github.com/user-attachments/assets/13ae0768-bd74-4d13-a2d6-ebf38e7478b8" /><br>
**Duplicate Tags**: Duplicate tags are displayed as red bubbles, except for the first occurrence.

<img width="198" height="35" alt="Screenshot 2026-02-23 155750" src="https://github.com/user-attachments/assets/289cb30e-85c0-4681-867b-a87a7f7272b9" /><br>
**Grouped Tags**: Grouped tags are for better readability. They are typically created when multiple tags are registered at once in the personal dictionary and then inserted into the prompt.<br>
They use the '`!!a/b/c/d!!`' format, but are automatically converted to '`a,b,c,d`' during image generation.
<br><br><br><br><br>

## Convenience Features

### Translation
- Easily translate tags using Google Translate. You can choose the target language (Korean, Japanese, English, etc.) in the settings.
- When generating images with translation enabled, translated text is automatically removed from the tags.
- You can remove translations using the `Clear Translation` button.

### Sorting & Editing
- Drag and drop to reorder tags, click to edit them instantly, and use right-click to move tags between positive and negative prompts.
- You can copy individual tags via right-click.
- Multi-select bubbles using Shift, Alt, or Ctrl and move them together.
- You can move tags in and out of group bubbles (dynamic prompt groups).
- When editing a tag without weight, entering only a numeric value automatically applies parentheses.<br>
  (e.g., entering `tag:1.2` will automatically convert it to `(tag:1.2)`)

### Personal Dictionary
- Save frequently used tags with translations and search them easily.
- Saved tags are stored in `extensions\sd-prompt-bubbles\prompt_bubbles_dict.json`.
- You can save multiple tags at once. When inserted into a prompt, they appear as grouped tag bubbles.

### Tag Search
Since this feature is not compatible with the default tag autocomplete, a separate tag search feature is provided.<br>
Place the existing tag autocomplete CSV file into the `extensions\sd-prompt-bubbles` directory and rename it to `tags.csv` to apply it to the tag dictionary.<br>

You can add additional custom tag files as well. Instructions:
- Save files in the `tags_*.csv` format and place them in the `extensions\sd-prompt-bubbles` directory.<br>
The string between `tags_` and `.csv` is used directly as a CSS color value, allowing you to visually distinguish tags in search results.
- Supported formats:<br>
Almost any CSS-recognized color format can be used in the filename.<br><br>
**Hex Code**: `tags_#ff0000.csv` (red)<br>
**Color Name**: `tags_blue.csv`, `tags_orange.csv`, etc.<br>
**RGB**: `tags_rgb(255,0,0).csv` will work in environments where parentheses and commas are allowed in filenames (e.g., Windows), but Hex codes or color names are recommended for better readability and stability.
  
- Summary: In addition to hex codes like `#059669`, you can also use color names such as `red`, `blue`, and `green` in filenames. Any standard CSS color name recognized by the browser will work.

CSV Column Structure
- **Column 1** (row[0]): Tag (required)<br>
If this value is empty, the row will be skipped.
- **Column 2** (row[1]): Type<br>
Currently read but not stored or used by the code.
- **Column 3** (row[2]): Count or Category<br>
If the value is numeric: treated as tag usage frequency (Count) and used for sorting search results.<br>
If the value is a string: treated as a category, and the count is set to 0.
- **Column 4** (row[3]): Aliases or Translation<br>
Used for alternative names or translations. Tags can also be found using keywords in this column.
- **Column 5** (row[4]): Extra Info<br>
Optional additional description for the tag. Displayed as small text in the search result list.


