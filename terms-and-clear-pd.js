// v1.9.0 — добавлено управление логами и задержка запуска рекламы

// ------------------------------------------------------
// Управление логами
// ------------------------------------------------------
window.DEBUG_TERMS = false;
function logTerms(...args) {
  if (window.DEBUG_TERMS) console.log(...args);
}
function debugTerms(state = true) {
  window.DEBUG_TERMS = !!state;
  console.log(`[TermsDebug] Логи ${state ? 'включены' : 'выключены'}`);
}

// ------------------------------------------------------
// Наблюдение за чекбоксами рекламы
// ------------------------------------------------------
function initAdvObserver() {
  const OBSERVER_CONFIG = { childList: true, subtree: true };

  const handleForm = (form) => {
    if (form.dataset._observerAttached) return;
    form.dataset._observerAttached = "true";

    const checkbox = form.querySelector('input[name="advertisment_agree"], input[name="advertisement_agree"]');
    const hiddenInputs = form.querySelectorAll('input[name="termsDocumentVersionId"], input[name="terms_document_version_id"]');

    if (!checkbox || hiddenInputs.length === 0) {
      logTerms('[AdObserver] ❌ Пропущена форма (нет чекбокса или инпутов)', form);
      return;
    }

    const waitUntilValueSet = () => {
      const allEmpty = Array.from(hiddenInputs).every((input) => !input.value);
      if (allEmpty) {
        requestAnimationFrame(waitUntilValueSet);
        return;
      }

      hiddenInputs.forEach((input) => {
        if (!input.dataset.originalName) {
          input.dataset.originalName = input.name;
        }
      });

      const updateHiddenNames = () => {
        hiddenInputs.forEach((input) => {
          if (checkbox.checked) {
            input.name = input.dataset.originalName || 'termsDocumentVersionId';
          } else {
            input.name = 'termsDocumentVersionId_kostilek';
          }
        });
      };

      checkbox.addEventListener('change', updateHiddenNames);
      updateHiddenNames();
    };

    waitUntilValueSet();
  };

  const processForms = () => {
    document.querySelectorAll('form.t-form').forEach(handleForm);
  };

  const observer = new MutationObserver(processForms);
  observer.observe(document.body, OBSERVER_CONFIG);

  document.addEventListener('DOMContentLoaded', processForms);
}

// ------------------------------------------------------
// Отправка ошибок
// ------------------------------------------------------
async function reportErrorToGoogleSheet(url, text, sheet) {
  const params = { errText: text, sheet: sheet || '', location: document.location.href };
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const urlSend = `${url}?${queryString}`;

  try {
    await fetch(urlSend, { method: 'GET', keepalive: true, mode: 'no-cors' });
  } catch {
    logTerms('Ошибка при отправке данных в Google Sheet');
  }
}

// ------------------------------------------------------
// Основная логика установки версий
// ------------------------------------------------------
var legal_response = {};

// ⬇️ ПОЛНАЯ ЗАМЕНА функции updateLegalSection
async function updateLegalSection({ url, inputName, textToFind, fallbackId, fallbackLink, priority }) {
  let versionId = fallbackId;
  let link = fallbackLink;
  let attempts = 0;
  const maxAttempts = 5;

  const isAdvSection = textToFind === termsConsts.adv.textToFind;

  logTerms(`🚀 [${textToFind}] старт updateLegalSection, приоритет ${priority}`);

  async function fetchLegalData() {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      versionId = data.versionId;
      link = data.link;
      legal_response[Array.isArray(inputName) ? inputName[0] : inputName] = data;
      logTerms(`📥 [${textToFind}] получили versionId=${versionId}`);
    } catch (error) {
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchLegalData();
      } else {
        console.error(`❌ [${textToFind}] fetch error:`, error.message);
        reportErrorToGoogleSheet(
          'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
          `updateLegalSection (${inputName}) failed: ${error.message}`,
          'Ошибки термса'
        );
      }
    }
  }

  await fetchLegalData();

  const intervalId = setInterval(() => {
    // 1) Вставка ссылки в лейблы (как было)
    const labelTexts = document.querySelectorAll('.t-checkbox__labeltext');
    let updatedLinkInserted = false;

    labelTexts.forEach(label => {
      if (label.textContent.includes(textToFind) && !label.querySelector('a.agreement_link')) {
        const newLink = document.createElement('a');
        newLink.href = link;
        newLink.target = '_blank';
        newLink.rel = 'noreferrer noopener';
        newLink.className = 'agreement_link';
        newLink.textContent = textToFind;
        label.innerHTML = label.innerHTML.replace(textToFind, newLink.outerHTML);
        updatedLinkInserted = true;
        logTerms(`🔗 [${textToFind}] вставлена ссылка`);
      }
    });

    // 2) Специальная логика для рекламы: если чекбокса рекламы НЕТ — выходим БЕЗ записи
    if (isAdvSection) {
      const advCheckbox = document.querySelector('form.t-form input[name="advertisment_agree"], form.t-form input[name="advertisement_agree"]');
      if (!advCheckbox) {
        logTerms(`🟡 [${textToFind}] чекбокса рекламы нет — ничего не записываем, очищаем интервал`);
        clearInterval(intervalId);
        return; // КРИТИЧЕСКО: предотвращает запись айди рекламы во 2-м кейсе
      }
    }

    // 3) Подбираем «корень» для поиска инпутов: для рекламы — форма чекбокса, для ПД — весь документ (как раньше)
    let rootNode = document;
    if (isAdvSection) {
      const advCheckbox = document.querySelector('form.t-form input[name="advertisment_agree"], form.t-form input[name="advertisement_agree"]');
      rootNode = (advCheckbox && advCheckbox.closest('form')) || document;
    }

    // 4) Поддерживаем оба имени инпута (camelCase и snake_case) + *_kostilek
    const selectors = (Array.isArray(inputName)
      ? inputName.flatMap(name => [`input[name="${name}"]`, `input[name="${name}_kostilek"]`])
      : [`input[name="${inputName}"]`, `input[name="${inputName}_kostilek"]`]);

    let updated = false;

    for (const selector of selectors) {
      const inputs = rootNode.querySelectorAll(selector);
      if (inputs.length === 0) {
        logTerms(`🔍 [${textToFind}] селектор не найден: ${selector}`);
        continue;
      }

      inputs.forEach(input => {
        const currentPriority = parseInt(input.dataset.priority || "0", 10);

        // ВАЖНО: если это реклама и форма переименовала инпут в *_kostilek при неотмеченном чекбоксе —
        // запись уйдет в *_kostilek и не попадет на сервер.
        if (!input.value || priority > currentPriority) {
          logTerms(`✍️ [${textToFind}] записываем ${versionId} в ${selector}`);
          input.value = versionId;
          input.dataset.priority = String(priority);
          updated = true;
        } else {
          logTerms(`⏭ [${textToFind}] пропуск записи, приоритет ${currentPriority} >= ${priority}`);
        }
      });
    }

    if (updated) {
      logTerms(`✅ [${textToFind}] записали ${versionId}, очищаем интервал`);
      clearInterval(intervalId);
    } else {
      // если мы только ссылку воткнули — через пару тиков всё равно прекратим попытки
      // чтобы не «висеть» зря
      setTimeout(() => {
        logTerms(`🕒 [${textToFind}] таймаут попыток, очищаем интервал`);
        clearInterval(intervalId);
      }, 3000);
    }
  }, 1000);
}


// ------------------------------------------------------
// Константы
// ------------------------------------------------------
const termsConsts = {
  terms: {
    url: 'https://legal.skyeng.ru/doc/describe/2068',
    inputName: ['termsDocumentVersionIdTemp', 'termsDocumentVersionId', 'terms_document_version_id'],
    textToFind: 'обработку персональных данных',
    fallbackId: '3970',
    fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/eRy-_sJz/_AyguvNa/KywmoFDR/h5P1cMQo/original/4039.pdf',
    priority: 1
  },
  adv: {
    url: 'https://legal.skyeng.ru/doc/describe/2066',
    inputName: ['termsDocumentVersionId', 'terms_document_version_id'],
    textToFind: 'на получение рекламы',
    fallbackId: '3968',
    fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/Z2eOzlap/4rqD5YqN/3_ibYi7P/5g2y5UGH/original/4037.pdf',
    priority: 2
  }
};

// ------------------------------------------------------
// Инициализация
// ------------------------------------------------------
function initTerms(customConfig) {
  const defaultConfig = [termsConsts.terms, termsConsts.adv];
  const config = Array.isArray(customConfig)
    ? customConfig
    : Array.isArray(window.termsConfig)
      ? window.termsConfig
      : defaultConfig;

  const termsCfg = config.find(c => c.priority === 1);
  const advCfg = config.find(c => c.priority === 2);

  if (termsCfg) {
    logTerms('⚙️ Запуск updateLegalSection для персональных данных');
    updateLegalSection(termsCfg);
  }

  if (advCfg) {
    logTerms('⏳ Отложенный запуск рекламы через 1500 мс');
    setTimeout(() => {
      logTerms('???? Старт updateLegalSection для рекламы');
      updateLegalSection(advCfg);
    }, 1500);
  }

  initAdvObserver();
}

// ------------------------------------------------------
// Перехват XMLHttpRequest
// ------------------------------------------------------
(function () {
  const sensitiveFields = [
    'name', 'parentName', 'childName', 'phone', 'parentPhone', 'email', 'parentEmail',
    'customer_attributes_parentName', 'customer_attributes_name',
    'customer_attributes_parentPhone', 'customer_attributes_phone',
    'customer_attributes_email', 'customer_attributes_parentEmail',
    'tildaspec-phone-part[]', 'tildaspec-phone-part[]-iso', 'referalEmail',
    'lastname', 'firstname', 'birthday', 'parentname', 'parentemail', 'parentphone', 'tildaspec-cookie'
  ];

  function getCookieTildaId(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      if (method.toUpperCase() === 'GET' && url.includes('script.google.com')) {
        sensitiveFields.forEach(f => urlObj.searchParams.delete(f));
        const tildasid = getCookieTildaId('tildasid');
        const tildauid = getCookieTildaId('tildauid');
        if (tildasid) urlObj.searchParams.set('tildasid', tildasid);
        if (tildauid) urlObj.searchParams.set('tildauid', tildauid);
        arguments[1] = urlObj.toString();
      }
    } catch (e) {
      reportErrorToGoogleSheet(
        'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
        `XMLHttpRequest.open error: ${e.message}`,
        'DEL PD ADD ID'
      );
    }
    return originalOpen.apply(this, arguments);
  };
})();
