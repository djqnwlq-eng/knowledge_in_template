// popup.js — 팝업 UI 전체 로직 (다중 상품 지원)

(function () {
  'use strict';

  // DOM 요소
  const productChips = document.getElementById('productChips');
  const emptyMsg = document.getElementById('emptyMsg');
  const btnToggleForm = document.getElementById('btnToggleForm');
  const productForm = document.getElementById('productForm');
  const productName = document.getElementById('productName');
  const productLink = document.getElementById('productLink');
  const productFeatures = document.getElementById('productFeatures');
  const btnSaveProduct = document.getElementById('btnSaveProduct');
  const btnDeleteProduct = document.getElementById('btnDeleteProduct');
  const btnCancelEdit = document.getElementById('btnCancelEdit');

  const btnGenerate = document.getElementById('btnGenerate');
  const generateStatus = document.getElementById('generateStatus');
  const answerArea = document.getElementById('answerArea');
  const answerText = document.getElementById('answerText');
  const generateError = document.getElementById('generateError');
  const btnCopy = document.getElementById('btnCopy');
  const btnRegenerate = document.getElementById('btnRegenerate');

  const apiKeyInput = document.getElementById('apiKey');
  const btnSaveApi = document.getElementById('btnSaveApi');
  const btnDeleteApi = document.getElementById('btnDeleteApi');
  const btnOpenApiModal = document.getElementById('btnOpenApiModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const apiModal = document.getElementById('apiModal');
  const apiStatusBadge = document.getElementById('apiStatusBadge');
  const apiModalStatus = document.getElementById('apiModalStatus');
  const btnToggleApiKey = document.getElementById('btnToggleApiKey');
  const btnAccordion = document.getElementById('btnAccordion');
  const accordionBody = document.getElementById('accordionBody');

  // 상태
  let products = [];         // {id, name, link, features}[]
  let selectedId = null;     // 선택된 상품 ID
  let editingId = null;      // 수정 중인 상품 ID (null이면 새 상품 추가 모드)

  // --- 초기화 ---
  init();

  async function init() {
    // 저장된 데이터 불러오기
    chrome.storage.local.get(['products', 'selected_product_id', 'gemini_api_key'], (result) => {
      // 기존 단일 상품 데이터 마이그레이션
      if (!result.products) {
        chrome.storage.local.get(['product_name', 'product_link', 'product_features'], (old) => {
          if (old.product_name) {
            const migrated = {
              id: Date.now().toString(),
              name: old.product_name,
              link: old.product_link || '',
              features: old.product_features || ''
            };
            products = [migrated];
            selectedId = migrated.id;
            saveProducts();
          }
          renderChips();
        });
      } else {
        products = result.products || [];
        selectedId = result.selected_product_id || (products.length > 0 ? products[0].id : null);
        renderChips();
      }

      if (result.gemini_api_key) {
        apiKeyInput.value = result.gemini_api_key;
        updateApiStatusUI(true);
      } else {
        updateApiStatusUI(false);
      }
    });

    // 이벤트 바인딩
    btnToggleForm.addEventListener('click', handleToggleForm);
    btnSaveProduct.addEventListener('click', handleSaveProduct);
    btnDeleteProduct.addEventListener('click', handleDeleteProduct);
    btnCancelEdit.addEventListener('click', handleCancelEdit);
    btnGenerate.addEventListener('click', handleGenerate);
    btnCopy.addEventListener('click', handleCopy);
    btnRegenerate.addEventListener('click', handleGenerate);
    btnSaveApi.addEventListener('click', handleSaveApiKey);
    btnDeleteApi.addEventListener('click', handleDeleteApiKey);
    btnOpenApiModal.addEventListener('click', () => showEl(apiModal));
    btnCloseModal.addEventListener('click', () => hideEl(apiModal));
    apiModal.addEventListener('click', (e) => {
      if (e.target === apiModal) hideEl(apiModal);
    });
    btnToggleApiKey.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
    });
    btnAccordion.addEventListener('click', () => {
      btnAccordion.classList.toggle('open');
      accordionBody.classList.toggle('hidden');
    });
  }

  // --- 상품 칩 렌더링 ---
  function renderChips() {
    productChips.innerHTML = '';

    if (products.length === 0) {
      showEl(emptyMsg);
      return;
    }
    hideEl(emptyMsg);

    products.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'product-chip' + (p.id === selectedId ? ' selected' : '');
      chip.innerHTML = `<span class="chip-name">${escapeHtml(p.name)}</span><span class="chip-edit" data-id="${p.id}" title="수정">&#9998;</span>`;

      // 칩 클릭 → 선택
      chip.querySelector('.chip-name').addEventListener('click', () => {
        selectedId = p.id;
        chrome.storage.local.set({ selected_product_id: selectedId });
        renderChips();
      });

      // 연필 아이콘 클릭 → 수정 모드
      chip.querySelector('.chip-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditForm(p.id);
      });

      productChips.appendChild(chip);
    });
  }

  // --- 폼 토글 ---
  function handleToggleForm() {
    if (!productForm.classList.contains('hidden')) {
      handleCancelEdit();
      return;
    }
    openAddForm();
  }

  function openAddForm() {
    editingId = null;
    productName.value = '';
    productLink.value = '';
    productFeatures.value = '';
    btnToggleForm.textContent = '- 닫기';
    hideEl(btnDeleteProduct);
    showEl(productForm);
  }

  function openEditForm(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    productName.value = p.name;
    productLink.value = p.link;
    productFeatures.value = p.features;
    btnToggleForm.textContent = '- 닫기';
    showEl(btnDeleteProduct);
    showEl(productForm);
  }

  function handleCancelEdit() {
    editingId = null;
    productName.value = '';
    productLink.value = '';
    productFeatures.value = '';
    btnToggleForm.textContent = '+ 상품 추가';
    hideEl(productForm);
    hideEl(btnDeleteProduct);
  }

  // --- 상품 저장 ---
  function handleSaveProduct() {
    const name = productName.value.trim();
    if (!name) {
      productName.focus();
      return;
    }

    if (editingId) {
      // 수정
      const p = products.find(x => x.id === editingId);
      if (p) {
        p.name = name;
        p.link = productLink.value.trim();
        p.features = productFeatures.value.trim();
      }
    } else {
      // 추가
      const newProduct = {
        id: Date.now().toString(),
        name,
        link: productLink.value.trim(),
        features: productFeatures.value.trim()
      };
      products.push(newProduct);
      selectedId = newProduct.id;
    }

    saveProducts();
    renderChips();
    handleCancelEdit();
  }

  // --- 상품 삭제 ---
  function handleDeleteProduct() {
    if (!editingId) return;
    products = products.filter(x => x.id !== editingId);
    if (selectedId === editingId) {
      selectedId = products.length > 0 ? products[0].id : null;
    }
    saveProducts();
    renderChips();
    handleCancelEdit();
  }

  // --- 스토리지 저장 ---
  function saveProducts() {
    chrome.storage.local.set({
      products,
      selected_product_id: selectedId
    });
  }

  // --- 선택된 상품 가져오기 ---
  function getSelectedProduct() {
    return products.find(x => x.id === selectedId) || null;
  }

  // --- API 키 저장 ---
  function handleSaveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiKeyInput.focus();
      return;
    }
    chrome.storage.local.set({ gemini_api_key: key }, () => {
      updateApiStatusUI(true);
      hideEl(apiModal);
    });
  }

  // --- API 키 삭제 ---
  function handleDeleteApiKey() {
    apiKeyInput.value = '';
    chrome.storage.local.remove('gemini_api_key', () => {
      updateApiStatusUI(false);
    });
  }

  // --- API 상태 UI 업데이트 ---
  function updateApiStatusUI(hasKey) {
    const badgeElements = [apiStatusBadge, apiModalStatus];
    badgeElements.forEach(badge => {
      const dot = badge.querySelector('.status-dot');
      const text = badge.querySelector('span:last-child');
      if (hasKey) {
        dot.className = 'status-dot green';
        text.textContent = 'API 키가 설정되어 있습니다';
      } else {
        dot.className = 'status-dot red';
        text.textContent = 'API 키가 설정되지 않았습니다';
      }
    });
  }

  // --- 질문 추출 ---
  async function extractQuestion() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('kin.naver.com')) {
      throw new Error('네이버 지식인 페이지를 열어주세요.');
    }

    // 방법 1: sendMessage
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractQuestion' });
      if (response && response.success && response.data) {
        return response.data;
      }
    } catch (e) {}

    // 방법 2: executeScript로 주입 후 재시도
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['extractor.js']
      });
      await new Promise(r => setTimeout(r, 500));
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractQuestion' });
      if (response && response.success) {
        return response.data;
      }
    } catch (e) {}

    // 방법 3: 직접 함수 실행 (확장 셀렉터 + 답변 영역 제외)
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // 답변 영역 셀렉터
          const ANSWER_SELS = [
            '.answer-content', '.answer_area', '.answerDetail',
            '.answer_detail', '.c-heading-answer',
            '.c-heading._answerContentsArea', '._answerArea',
            '.answer', '[class*="answer"]', '.reply_area',
            '.reply_content', '.best_answer', '.adoptDetail',
          ];

          function isAnswerArea(el) {
            for (const s of ANSWER_SELS) {
              if (el.closest(s)) return true;
            }
            return false;
          }

          function q(sels) {
            for (const s of sels) {
              const els = document.querySelectorAll(s);
              for (const el of els) {
                if (el.textContent.trim().length > 0 && !isAnswerArea(el)) return el;
              }
            }
            return null;
          }

          const titleEl = q([
            '.c-heading__title', '.c-heading .title',
            '.question-title', '.questionDetail .title',
            '.title_area .title', '.question_title',
            'h3.title', 'h2.title', '#content h3',
          ]);
          let title = titleEl?.textContent?.trim() || '';
          if (!title) {
            const og = document.querySelector('meta[property="og:title"]');
            title = (og?.getAttribute('content') || '')
              .replace(/ : 지식iN$/, '').replace(/ - 네이버.*$/, '').trim();
          }
          if (!title) {
            title = (document.title || '')
              .replace(/ : 지식iN$/, '').replace(/ - 네이버.*$/, '').trim();
          }

          const contentEl = q([
            '.c-heading._questionContentsArea .c-heading__content',
            '.question_area .c-heading__content',
            '.questionDetail .c-heading__content',
            '.c-heading__content',
            '._questionContentsArea',
            '.question-content', '.question-content-area',
            '.questionDetail .se-main-container',
            '.endContentBody', '.end_content', '._endContents',
            '.detail_content', '.question_content',
          ]);
          let content = contentEl?.innerText?.trim() || '';

          // 휴리스틱 폴백 (질문 영역만, #content 제외)
          if (!content) {
            const wrappers = ['.questionDetail', '.question-area',
              '.question_area', '.c-heading._questionContentsArea'];
            for (const ws of wrappers) {
              const w = document.querySelector(ws);
              if (!w) continue;
              let best = '';
              for (const el of w.querySelectorAll('div, p, span')) {
                if (el.children.length > 10) continue;
                if (isAnswerArea(el)) continue;
                const t = el.innerText?.trim() || '';
                if (t.length > best.length && t.length < 5000) best = t;
              }
              if (best.length > 10) { content = best; break; }
            }
          }

          if (!content) {
            const og = document.querySelector('meta[property="og:description"]');
            content = og?.getAttribute('content')?.trim() || '';
          }

          if (content.length > 5 || title.length > 3) {
            return {
              success: true,
              data: { title, content: content || title, url: window.location.href }
            };
          }
          return { success: false };
        }
      });

      if (results[0]?.result?.success) {
        return results[0].result.data;
      }
    } catch (e) {}

    throw new Error('질문 내용을 찾을 수 없습니다. 지식인 질문 페이지에서 실행해주세요.');
  }

  // --- 답변 생성 ---
  async function handleGenerate() {
    const product = getSelectedProduct();
    if (!product) {
      showError(generateError, '상품을 먼저 선택해주세요.');
      return;
    }

    hideEl(generateError);
    hideEl(answerArea);
    btnGenerate.disabled = true;
    btnGenerate.classList.add('loading');
    showEl(generateStatus);

    // 질문 추출
    btnGenerate.textContent = '질문 추출 중...';
    generateStatus.textContent = '질문을 추출하고 있습니다...';
    let question;
    try {
      question = await extractQuestion();
    } catch (e) {
      hideEl(generateStatus);
      showError(generateError, e.message);
      btnGenerate.disabled = false;
      btnGenerate.textContent = '답변 생성하기';
      btnGenerate.classList.remove('loading');
      return;
    }

    // 답변 생성
    btnGenerate.textContent = '답변 생성 중...';
    generateStatus.textContent = 'Gemini API에 요청 중...';

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Gemini API 키를 먼저 설정해주세요.');
      }

      const prompt = buildAnswerPrompt(question, product);
      const answer = await callGemini(prompt, apiKey);

      answerText.textContent = answer;
      showEl(answerArea);
      hideEl(generateStatus);
      answerArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      hideEl(generateStatus);
      showError(generateError, e.message);
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = '답변 생성하기';
      btnGenerate.classList.remove('loading');
    }
  }

  function buildAnswerPrompt(question, product) {
    // 마지막 문장 다양화를 위한 랜덤 스타일 지정
    const closingStyles = [
      '병원 방문을 부드럽게 권유하는 톤',
      '전문의 상담을 조심스럽게 제안하는 톤',
      '피부과/병원 검진을 가볍게 언급하는 톤',
      '전문가 도움을 따뜻하게 권하는 톤',
      '병원 진료를 자연스럽게 덧붙이는 톤',
      '전문의 진단을 안심시키며 추천하는 톤',
      '가까운 병원 방문을 편하게 권하는 톤',
      '전문 상담을 걱정 없이 받아보라는 톤',
    ];
    const closingStyle = closingStyles[Math.floor(Math.random() * closingStyles.length)];

    const toneStyles = [
      '친근한 선배처럼',
      '경험 많은 전문가처럼',
      '옆집 언니/오빠처럼 편하게',
      '믿음직한 약사처럼',
      '차분한 상담사처럼',
    ];
    const toneStyle = toneStyles[Math.floor(Math.random() * toneStyles.length)];

    return `[시스템 역할]
너는 지식인에서 활동하는 10년 차 건강 및 피부 관리 전문가야. ${toneStyle} 말투로 질문자의 고통에 깊이 공감하면서도, 의학적 주의사항과 실질적인 관리법을 논리적이고 직관적으로 제시해. 말투는 정확하고 신뢰감 있되, 실제 사람들이 사용하는 자연스러운 단어를 사용해줘.

[질문]
${question.title || ''}
${question.content}

[내 상품 정보 (답변 작성 시 참고용)]
- 제품명: ${product.name || '(제품명 미입력)'}
- 상품 링크(참고용, 답변에 절대 포함하지 말 것): ${product.link || '(링크 없음)'}
- 상품 특장점: ${product.features || '(특장점 미입력)'}

[작성 규칙]
- 전체 길이는 3~4줄 내외로 짧고 강렬하게 작성할 것.
- 구조: [공감 및 원인 분석] -> [질문 답변 및 주의사항] -> [내 상품 해결책 제안] -> [증상이 심하면 병원/전문의 상담 권유].
- 첫 문장 작성 시 반드시 질문 원문을 정확히 읽고, 질문자가 실제로 묻고 있는 핵심 의도를 파악할 것.
- 질문에 언급되지 않은 내용(피곤, 스트레스, 면역력 등)을 임의로 추측하여 넣지 말 것. 질문 원문에 있는 키워드와 상황만 활용할 것.
- 첫 문장에 "아이고", "어머", "세상에", "헉" 같은 가벼운 감탄사를 사용하지 말 것. 바로 본론으로 들어갈 것.
- 첫 문장은 질문 유형에 맞게 시작할 것:
  · "왜 이런 건가요?" 류의 원인 질문 → 바로 원인/이유를 설명하며 시작
  · "어떻게 하나요?" 류의 방법 질문 → 상황 공감 후 관리법 제시
  · "이거 괜찮나요?" 류의 확인 질문 → 불안감 공감 후 판단 제시
  · "추천해주세요" 류의 요청 질문 → 니즈 파악 후 제안
  위 예시는 참고용이며 그대로 복사하지 말고, 질문 내용에 맞게 자연스럽게 변형할 것.
- 상품을 추천할 때 반드시 위에 명시된 "제품명"을 정확히 사용하여 자연스럽게 언급할 것.
- 상품 특장점에 여러 가지가 나열되어 있더라도, 질문 내용과 가장 관련 있는 특징 1~2가지만 골라서 언급할 것. 매번 다른 특징을 선택해서 답변이 다양해지도록 할 것.
- '광고' 느낌을 지우기 위해 "이런 성분이 든 제품이 도움 됩니다" 또는 "연고보다는 자극이 적은 전용 제품을 사용하는 것이 장기적으로 훨씬 안전합니다"라는 식의 추천 어투를 사용할 것.
- 너무 어려운 전문 용어는 피하고, 꼭 필요한 경우 쉬운 설명을 덧붙일 것.
- 숫자로 단락을 나누지 말고, 대본처럼 문장과 문장을 자연스럽게 이어서 작성할 것.
- 결론부터 직관적으로 말하고 중립적이면서도 확신에 찬 어조를 유지할 것.
- 마지막 문장은 "${closingStyle}"으로 병원/전문의 상담을 권유하며 마무리할 것. 이전 예시를 그대로 복사하지 말고 매번 새로운 문장으로 작성할 것.
- "광고", "협찬", "홍보" 같은 표현은 절대 사용 금지.

[문체 규칙]
- 문장 끝맺음을 ~요, ~죠, ~습니다, ~다, ~거든요, ~세요, ~해요, ~됩니다 등 다양하게 섞어서 사용할 것.
- 같은 어미를 연속으로 2번 이상 반복하지 말 것. 예를 들어 "~좋아요. ~많아요. ~돼요." 처럼 "~요"가 연속 3번 나오면 안 됨.
- 실제 지식인에서 답변하는 사람처럼 자연스러운 구어체를 사용할 것.
- 딱딱한 설명문이 아니라, 대화하듯 편하게 쓸 것.

[절대 금지]
- 상품 링크(URL)를 답변에 포함하는 것
- 노골적인 광고 문구
- "이 제품 최고입니다!" 같은 과장
- 질문과 무관한 답변
- 다른 상품을 깎아내리는 비교
- 번호 매기기 (1. 2. 3. 등)

답변 본문만 출력해. 추가 설명이나 주석 없이 순수 답변 텍스트만.`;
  }

  async function callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!response.ok) {
      if (response.status === 400) throw new Error('API 키가 올바르지 않습니다.');
      if (response.status === 429) throw new Error('API 한도 초과. 잠시 후 다시 시도하세요.');
      throw new Error('API 오류 (' + response.status + ')');
    }

    const data = await response.json();
    if (!data.candidates?.[0]) throw new Error('응답 없음. 다시 시도하세요.');
    const candidate = data.candidates[0];
    const parts = candidate.content?.parts || [];
    const text = parts.map(p => p.text || '').join('').trim();
    if (!text) throw new Error('빈 응답입니다. 다시 시도하세요.');
    return text;
  }

  // --- 복사 ---
  async function handleCopy() {
    const text = answerText.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      btnCopy.textContent = '복사됨!';
      btnCopy.style.color = '#03C75A';
      setTimeout(() => {
        btnCopy.textContent = '복사하기';
        btnCopy.style.color = '';
      }, 1500);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btnCopy.textContent = '복사됨!';
      setTimeout(() => { btnCopy.textContent = '복사하기'; }, 1500);
    }
  }

  // --- 유틸 ---
  async function getApiKey() {
    return new Promise(resolve => {
      chrome.storage.local.get(['gemini_api_key'], (result) => {
        resolve(result.gemini_api_key || '');
      });
    });
  }

  function showEl(el) { el.classList.remove('hidden'); }
  function hideEl(el) { el.classList.add('hidden'); }

  function showError(el, msg) {
    el.textContent = msg;
    showEl(el);
  }

  function flashMsg(el, msg) {
    el.textContent = msg;
    showEl(el);
    setTimeout(() => hideEl(el), 2000);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
