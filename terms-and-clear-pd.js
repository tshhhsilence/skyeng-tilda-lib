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

// Объект для хранения данных о юридической информации
var legal_response = {}
// Идентификатор интервала для обновления элементов
var intervalIdTerms

/**
 * Функция для обновления элементов с текстом, содержащим юридическую информацию
 * textToFind - Текст, который нужно найти и заменить на ссылку
 */
function updateTermsElements(textToFind) {
  try {
    // Находим все элементы с текстом в лейблах чекбоксов
    const labelTexts = document.querySelectorAll('.t-checkbox__labeltext')

    if (labelTexts.length > 0) {
      labelTexts.forEach((label) => {
        const text = label.textContent

        // Если текст содержит искомую строку, заменяем её на ссылку
        if (text.includes(textToFind)) {
          const newLink = document.createElement('a')
          newLink.href = legal_response.link
          newLink.target = '_blank'
          newLink.rel = 'noreferrer noopener' // Защита при открытии ссылок
          newLink.className = 'agreement_link'
          newLink.textContent = textToFind

          // Заменяем найденный текст на HTML ссылки
          label.innerHTML = label.innerHTML.replace(
            textToFind,
            newLink.outerHTML,
          )
        }
      })

      // Устанавливаем значение для скрытых input элементов
      const inputs = document.querySelectorAll(
        'input[name="termsDocumentVersionId"]',
      )
      inputs.forEach((input) => {
        input.value = legal_response.versionId
      })

      // Останавливаем интервал, так как все элементы обновлены
      clearInterval(intervalIdTerms)
    }
  } catch (error) {
    // Логируем ошибку в консоль, если произошел сбой
    console.error('Произошла ошибка:', error)
  }
}

// Переменная для отслеживания количества попыток
var attempts = 0
// Максимальное количество попыток
const maxAttempts = 10

/**
 * Функция инициализации обновления условий
 * urlLegal - URL для получения данных об условиях
 * defaultLegal - URL по умолчанию на случай ошибки
 * defaultTermsId - ID версии условий по умолчанию
 * textToFind - Текст для поиска и замены
 */
function initTerms({
  urlLegal = 'https://legal.skyeng.ru/doc/describe/the_agreement_of_the_pd_skyeng_landing',
  defaultLegal = 'https://legal.skyeng.ru/upload/document-version-pdf/ApzbiBJ4/VdHPCtjB/NK_qCnmY/uJ6Wnawk/original/3085.pdf',
  defaultTermsId = 3019,
  textToFind = 'обработку персональных данных',
}) {
  fetch(urlLegal)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`)
      }
      return response.json()
    })
    .then((data) => {
      legal_response = data
      intervalIdTerms = setInterval(() => {
        updateTermsElements(textToFind)
      }, 1000)
    })
    .catch((error) => {
      console.error('Произошла ошибка:', error)
      attempts++

      if (attempts < maxAttempts) {
        setTimeout(() => {
          initTerms({ urlLegal, defaultLegal, defaultTermsId, textToFind })
        }, 1000)
      } else {
        console.error(
          'Функция вызвала ошибку более ' +
            maxAttempts +
            ' раз. Перезапуск прекращен.',
        )

        // Отправляем репорт только один раз, если попытки закончились
        reportErrorToGoogleSheet(
          'https://script.google.com/macros/s/AKfycbyhGl-E4JTKeWW-jGtxSUsiys6DMVC3PH4XrnNSsiHwxN47YyeCmJ-tySIHhhUwaMavnA/exec',
          `initTerms error after ${maxAttempts} attempts: ${error.message}`,
          'Ошибки термса'
        )

        legal_response.link = defaultLegal
        legal_response.versionId = defaultTermsId
        updateTermsElements(textToFind)
      }
    })
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

