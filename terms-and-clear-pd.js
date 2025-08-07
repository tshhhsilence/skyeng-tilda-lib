/**
 * Глобальная функция для отправки ошибок в Google Таблицу
 * @param {string} url - URL скрипта Google Apps Script
 * @param {string} text - Текст ошибки
 * @param {string} sheet - Название листа
 */
async function reportErrorToGoogleSheet(url, text, sheet) {
  const params = {
    errText: text,
    sheet: sheet || '',
    location: document.location.href,
  }

  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

  const urlSend = `${url}?${queryString}`

  try {
    await fetch(urlSend, {
      method: 'GET',
      keepalive: true,
      mode: 'no-cors',
    })
  } catch (error) {
    console.log('Ошибка при отправке данных в Google Sheet (reportErrorToGoogleSheet)')
  }
}

// Глобальный объект для хранения всех юридических данных
var legal_response = {}

async function updateLegalSection({ url, inputName, textToFind, fallbackId, fallbackLink }) {
  let versionId = fallbackId
  let link = fallbackLink
  let attempts = 0
  const maxAttempts = 5

  async function fetchLegalData() {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`)
      const data = await res.json()
      versionId = data.versionId
      link = data.link

      // Сохраняем ответ в глобальный объект
      legal_response[inputName] = data
    } catch (error) {
      attempts++
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000))
        return fetchLegalData()
      } else {
        reportErrorToGoogleSheet(
          'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
          `updateLegalSection (${inputName}) failed after ${maxAttempts} attempts: ${error.message}`,
          'Ошибки термса'
        )

        // fallback сохраняем тоже
        legal_response[inputName] = {
          versionId: fallbackId,
          link: fallbackLink
        }
      }
    }
  }

  await fetchLegalData()

  const intervalId = setInterval(() => {
    const labelTexts = document.querySelectorAll('.t-checkbox__labeltext')
    let updated = false

    labelTexts.forEach((label) => {
      if (label.textContent.includes(textToFind)) {
        const newLink = document.createElement('a')
        newLink.href = link
        newLink.target = '_blank'
        newLink.rel = 'noreferrer noopener'
        newLink.className = 'agreement_link'
        newLink.textContent = textToFind

        label.innerHTML = label.innerHTML.replace(textToFind, newLink.outerHTML)
        updated = true
      }
    })

    if (updated) {
      const inputs = document.querySelectorAll(`input[name="${inputName}"]`)
      inputs.forEach((input) => {
        input.value = versionId
      })
      clearInterval(intervalId)
    }
  }, 1000)
}

function initTerms(customConfig) {
  const defaultConfig = [
    {
      url: 'https://legal.skyeng.ru/doc/describe/2068',
      inputName: 'termsDocumentVersionId',
      textToFind: 'обработку персональных данных',
      fallbackId: 3970,
      fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/eRy-_sJz/_AyguvNa/KywmoFDR/h5P1cMQo/original/4039.pdf'
    },
    {
      url: 'https://legal.skyeng.ru/doc/describe/2066',
      inputName: 'advDocumentVersionId',
      textToFind: 'на получение рекламы',
      fallbackId: 3968,
      fallbackLink: 'https://legal.skyeng.ru/upload/document-version-pdf/Z2eOzlap/4rqD5YqN/3_ibYi7P/5g2y5UGH/original/4037.pdf'
    }
  ]

  const config = Array.isArray(customConfig)
    ? customConfig
    : Array.isArray(window.termsConfig)
      ? window.termsConfig
      : defaultConfig

  config.forEach(cfg => updateLegalSection(cfg))
}

(function () {
  const sensitiveFields = [
    'name', 'parentName', 'childName', 'phone', 'parentPhone', 'email', 'parentEmail',
    'customer_attributes_parentName', 'customer_attributes_name',
    'customer_attributes_parentPhone', 'customer_attributes_phone',
    'customer_attributes_email', 'customer_attributes_parentEmail',
    'tildaspec-phone-part[]', 'tildaspec-phone-part[]-iso', 'referalEmail', 'lastname', 'firstname', 'birthday',
    'parentname', 'parentemail', 'parentphone', 'tildaspec-cookie'
  ]

  function getCookieTildaId(name) {
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + name + '=([^;]*)')
    )
    return match ? decodeURIComponent(match[1]) : null
  }

  const originalOpen = XMLHttpRequest.prototype.open

  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      const urlObj = new URL(url, window.location.origin)

      if (method.toUpperCase() === 'GET' && url.includes('script.google.com')) {
        // Удаляем чувствительные поля
        sensitiveFields.forEach((field) => urlObj.searchParams.delete(field))

        // Добавляем параметры из cookies, если они есть
        const tildasid = getCookieTildaId('tildasid')
        const tildauid = getCookieTildaId('tildauid')
        if (tildasid) urlObj.searchParams.set('tildasid', tildasid)
        if (tildauid) urlObj.searchParams.set('tildauid', tildauid)

        arguments[1] = urlObj.toString() // Обновлённый URL
      }
    } catch (e) {
      console.warn('URL обработка не удалась:', e)

      reportErrorToGoogleSheet(
        'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
        `XMLHttpRequest.open error: ${e.message}`,
        'DEL PD ADD ID'
      )
    }

    return originalOpen.apply(this, arguments)
  }
})()
