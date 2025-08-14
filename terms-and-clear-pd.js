// v1.6.0
// === Глобальный объект для юридических данных ===
var legal_response = {};
// === Оптимизация текста с обычными и неразрывными пробелами ===
function withNbspVariants(...phrases) {
  return phrases.flatMap(p => [
    p,
    p.replace(/ /g, '\u00A0') // заменяем обычный пробел на неразрывный
  ]);
}

// === Константы для терминов и рекламы ===
const termsConsts = {
  terms: {
    url: 'https://legal.skyeng.ru/doc/describe/2068',
    inputName: ['termsDocumentVersionIdTemp', 'termsDocumentVersionId'],
    textToFind: withNbspVariants('на обработку персональных данных', 'обработку персональных данных'),
    fallbackId: '3970',
    fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/eRy-_sJz/_AyguvNa/KywmoFDR/h5P1cMQo/original/4039.pdf',
  },
  adv: {
    url: 'https://legal.skyeng.ru/doc/describe/2066',
    inputName: ['termsDocumentVersionId'],
    textToFind: withNbspVariants('на получение рекламы'),
    fallbackId: '3968',
    fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/Z2eOzlap/4rqD5YqN/3_ibYi7P/5g2y5UGH/original/4037.pdf',
  }
};

// === Функция инициализации терминов ===
function initTerms(customConfig) {
  const defaultConfig = [
    {
      url: termsConsts.terms.url,
      inputName: termsConsts.terms.inputName,
      textToFind: termsConsts.terms.textToFind,
      fallbackId: termsConsts.terms.fallbackId,
      fallbackLink: termsConsts.terms.fallbackLink
    },
    {
      url: termsConsts.adv.url,
      inputName: termsConsts.adv.inputName,
      textToFind: termsConsts.adv.textToFind,
      fallbackId: termsConsts.adv.fallbackId,
      fallbackLink: termsConsts.adv.fallbackLink
    }
  ];

  const config = Array.isArray(customConfig)
    ? customConfig
    : Array.isArray(window.termsConfig)
      ? window.termsConfig
      : defaultConfig;

  config.forEach(cfg => updateLegalSection(cfg));

  initAdvObserver();
}

// === Обработчик форм для рекламы ===
function initAdvObserver() {
  const OBSERVER_CONFIG = { childList: true, subtree: true };

  const handleForm = (form) => {
    if (form.dataset._observerAttached) return;
    form.dataset._observerAttached = "true";

    const checkbox = form.querySelector('input[name="advertisment_agree"]');
    const hiddenInput = form.querySelector('input[name="termsDocumentVersionId"]');

    if (!checkbox || !hiddenInput) return;

    const waitUntilValueSet = () => {
      const currentValue = hiddenInput.value;
      if (!currentValue) {
        requestAnimationFrame(waitUntilValueSet);
        return;
      }

      if (!hiddenInput.dataset.originalName) {
        hiddenInput.dataset.originalName = hiddenInput.name;
      }

      const updateHiddenName = () => {
        hiddenInput.name = checkbox.checked ? (hiddenInput.dataset.originalName || 'termsDocumentVersionId') : 'termsDocumentVersionId_kostilek';
      };

      checkbox.addEventListener('change', updateHiddenName);
      updateHiddenName();
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

// === Отправка ошибок в Google Sheet ===
async function reportErrorToGoogleSheet(url, text, sheet) {
  const params = {
    errText: text,
    sheet: sheet || '',
    location: document.location.href,
  };

  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  const urlSend = `${url}?${queryString}`;

  try {
    await fetch(urlSend, { method: 'GET', keepalive: true, mode: 'no-cors' });
  } catch {
    console.log('Ошибка при отправке данных в Google Sheet');
  }
}

// === Обновление секции юридического документа ===
async function updateLegalSection({ url, inputName, textToFind, fallbackId, fallbackLink }) {
  let versionId = fallbackId;
  let link = fallbackLink;
  let attempts = 0;
  const maxAttempts = 5;

  async function fetchLegalData() {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      versionId = data.versionId;
      link = data.link;
      legal_response[Array.isArray(inputName) ? inputName[0] : inputName] = data;
    } catch (error) {
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchLegalData();
      } else {
        reportErrorToGoogleSheet(
          'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
          `updateLegalSection (${inputName}) failed after ${maxAttempts} attempts: ${error.message}`,
          'Ошибки термса'
        );
        legal_response[Array.isArray(inputName) ? inputName[0] : inputName] = { versionId: fallbackId, link: fallbackLink };
      }
    }
  }

  await fetchLegalData();

  const intervalId = setInterval(() => {
    const labelTexts = document.querySelectorAll('.t-checkbox__labeltext');
    let updated = false;

    labelTexts.forEach((label) => {
      const searchTexts = Array.isArray(textToFind) ? textToFind : [textToFind];

      searchTexts.forEach(text => {
        if (label.textContent.includes(text)) {
          const newLink = document.createElement('a');
          newLink.href = link;
          newLink.target = '_blank';
          newLink.rel = 'noreferrer noopener';
          newLink.className = 'agreement_link';
          newLink.textContent = text;

          label.innerHTML = label.innerHTML.replace(text, newLink.outerHTML);
          updated = true;
        }
      });
    });

    if (updated) {
      const selectors = Array.isArray(inputName) ? inputName.map(name => `input[name="${name}"]`) : [`input[name="${inputName}"]`];
      for (const selector of selectors) {
        const inputs = document.querySelectorAll(selector);
        if (inputs.length > 0) {
          inputs.forEach(input => input.value = versionId);
          break;
        }
      }
      clearInterval(intervalId);
    }
  }, 1000);
}

// === Перехват и очистка чувствительных полей в XMLHttpRequest ===
(function () {
  const sensitiveFields = [
    'name', 'parentName', 'childName', 'phone', 'parentPhone', 'email', 'parentEmail',
    'customer_attributes_parentName', 'customer_attributes_name',
    'customer_attributes_parentPhone', 'customer_attributes_phone',
    'customer_attributes_email', 'customer_attributes_parentEmail',
    'tildaspec-phone-part[]', 'tildaspec-phone-part[]-iso', 'referalEmail', 'lastname', 'firstname', 'birthday',
    'parentname', 'parentemail', 'parentphone', 'tildaspec-cookie'
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
        sensitiveFields.forEach(field => urlObj.searchParams.delete(field));

        const tildasid = getCookieTildaId('tildasid');
        const tildauid = getCookieTildaId('tildauid');
        if (tildasid) urlObj.searchParams.set('tildasid', tildasid);
        if (tildauid) urlObj.searchParams.set('tildauid', tildauid);

        arguments[1] = urlObj.toString();
      }
    } catch (e) {
      console.warn('URL обработка не удалась:', e);
      reportErrorToGoogleSheet(
        'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
        `XMLHttpRequest.open error: ${e.message}`,
        'DEL PD ADD ID'
      );
    }
    return originalOpen.apply(this, arguments);
  };
})();
