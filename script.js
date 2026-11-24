/**
 * GRAVITY FADE — Barbershop Sofia
 * Vanilla JS (no build step required):
 *  - Sticky header elevation & mobile menu toggle
 *  - Live "Open / Closed" status based on Sofia time (Europe/Sofia)
 *  - Quick-select service buttons that prefill the booking form
 *  - Dynamic date & working-hours time slot generator (blocks Sundays & past slots)
 *  - Client-side Bulgarian validation & confirmation view
 *  - Clean owner email notification adapter ready for Formspree / EmailJS / custom API
 */

(() => {
  'use strict';

  /* =========================================================================
     1. OWNER EMAIL NOTIFICATION CONFIGURATION
     -------------------------------------------------------------------------
     Switch `mode` from 'demo' to 'formspree' or 'webhook' when ready to send
     real booking emails to the barbershop owner without adding a build tool:
       - Formspree (easiest, zero backend):
           1) Create a free form at https://formspree.io linked to ownerEmail
           2) Set mode: 'formspree' and paste your endpoint URL below
       - Custom Backend / n8n / Make webhook:
           Set mode: 'webhook' and paste your POST URL in `endpoint`
     ========================================================================= */
  const BOOKING_CONFIG = {
    mode: 'demo', // 'demo' | 'formspree' | 'webhook'
    endpoint: '', // e.g. 'https://formspree.io/f/yourFormId'
    ownerEmail: 'bookings@gravityfade.bg',
    shopName: 'GRAVITY FADE',
    timezone: 'Europe/Sofia',
  };

  /**
   * Working hours by JS weekday (0 = Sunday ... 6 = Saturday).
   * `lastSlotMinutes` is the final bookable start time in minutes from midnight.
   */
  const WORKING_HOURS = {
    0: null, // Неделя — почивен ден
    1: { open: 10 * 60, close: 20 * 60, lastSlot: 19 * 60 + 30 },
    2: { open: 10 * 60, close: 20 * 60, lastSlot: 19 * 60 + 30 },
    3: { open: 10 * 60, close: 20 * 60, lastSlot: 19 * 60 + 30 },
    4: { open: 10 * 60, close: 20 * 60, lastSlot: 19 * 60 + 30 },
    5: { open: 10 * 60, close: 20 * 60, lastSlot: 19 * 60 + 30 },
    6: { open: 10 * 60, close: 18 * 60, lastSlot: 17 * 60 + 30 },
  };

  const SLOT_INTERVAL_MINUTES = 30;

  /* =========================================================================
     2. DOM REFERENCES
     ========================================================================= */
  const header = document.querySelector('.site-header');
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');
  const openStatusEl = document.getElementById('openStatus');
  const currentYearEl = document.getElementById('currentYear');

  const bookingForm = document.getElementById('bookingForm');
  const formAlert = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBookingBtn');
  const confirmationBox = document.getElementById('bookingConfirmation');
  const newBookingBtn = document.getElementById('newBookingBtn');

  const fields = {
    name: document.getElementById('clientName'),
    phone: document.getElementById('clientPhone'),
    email: document.getElementById('clientEmail'),
    service: document.getElementById('bookingService'),
    date: document.getElementById('bookingDate'),
    time: document.getElementById('bookingTime'),
  };

  const errorEls = {
    name: document.getElementById('clientNameError'),
    phone: document.getElementById('clientPhoneError'),
    email: document.getElementById('clientEmailError'),
    service: document.getElementById('bookingServiceError'),
    date: document.getElementById('bookingDateError'),
    time: document.getElementById('bookingTimeError'),
  };

  /* =========================================================================
     3. TIMEZONE & DATE HELPERS (SOFIA TIME)
     ========================================================================= */
  function getSofiaNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: BOOKING_CONFIG.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const map = {};
    parts.forEach((p) => {
      if (p.type !== 'literal') map[p.type] = Number(p.value);
    });

    const localDate = new Date(map.year, map.month - 1, map.day);
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      weekday: localDate.getDay(),
      minutesNow: (map.hour % 24) * 60 + map.minute,
      isoDate: `${map.year}-${String(map.month).padStart(2, '0')}-${String(map.day).padStart(2, '0')}`,
    };
  }

  function parseIsoDate(isoString) {
    const [year, month, day] = isoString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatMinutes(totalMinutes) {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mins = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${mins}`;
  }

  function formatBulgarianDate(isoString) {
    const dateObj = parseIsoDate(isoString);
    return new Intl.DateTimeFormat('bg-BG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dateObj);
  }

  /* =========================================================================
     4. HEADER, MOBILE NAV & LIVE STATUS
     ========================================================================= */
  function initHeader() {
    const onScroll = () => {
      if (!header) return;
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (!menuToggle || !mobileNav) return;

    const closeMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Отвори менюто');
      mobileNav.hidden = true;
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Отвори менюто' : 'Затвори менюто');
      mobileNav.hidden = isOpen;
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !mobileNav.hidden) {
        closeMenu();
        menuToggle.focus();
      }
    });
  }

  function updateLiveOpenStatus() {
    const sofia = getSofiaNow();
    const schedule = WORKING_HOURS[sofia.weekday];

    // Highlight today's row in the working hours list
    document.querySelectorAll('.hours-row[data-days]').forEach((row) => {
      const days = row.dataset.days.split(',').map(Number);
      row.classList.toggle('is-today', days.includes(sofia.weekday));
    });

    if (!openStatusEl) return;

    const isOpen =
      schedule !== null &&
      sofia.minutesNow >= schedule.open &&
      sofia.minutesNow < schedule.close;

    openStatusEl.classList.toggle('is-open', isOpen);
    openStatusEl.classList.toggle('is-closed', !isOpen);

    if (isOpen) {
      openStatusEl.textContent = `Отворено до ${formatMinutes(schedule.close)}`;
    } else if (schedule && sofia.minutesNow < schedule.open) {
      openStatusEl.textContent = `Отваря в ${formatMinutes(schedule.open)}`;
    } else {
      openStatusEl.textContent = 'Затворено в момента';
    }
  }

  /* =========================================================================
     5. SERVICE QUICK-SELECT BUTTONS
     ========================================================================= */
  function initServiceQuickSelect() {
    document.querySelectorAll('[data-select-service]').forEach((button) => {
      button.addEventListener('click', () => {
        const serviceName = button.getAttribute('data-select-service');
        if (!serviceName || !fields.service) return;

        // If user already submitted a booking, show the form again
        if (confirmationBox && !confirmationBox.hidden) {
          resetToForm();
        }

        fields.service.value = serviceName;
        clearFieldError('service');

        const bookingSection = document.getElementById('booking');
        if (bookingSection) {
          bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Focus name input gently after scroll starts
        setTimeout(() => {
          if (fields.name && !fields.name.value.trim()) {
            fields.name.focus({ preventScroll: true });
          } else {
            fields.date?.focus({ preventScroll: true });
          }
        }, 350);
      });
    });
  }

  /* =========================================================================
     6. DYNAMIC TIME SLOTS & FORM VALIDATION
     ========================================================================= */
  function populateTimeSlots(selectedIsoDate) {
    const timeSelect = fields.time;
    if (!timeSelect) return;

    timeSelect.innerHTML = '';

    if (!selectedIsoDate) {
      timeSelect.append(new Option('Първо изберете дата…', ''));
      timeSelect.disabled = true;
      return;
    }

    const sofia = getSofiaNow();
    const dateObj = parseIsoDate(selectedIsoDate);
    const weekday = dateObj.getDay();
    const schedule = WORKING_HOURS[weekday];

    if (!schedule) {
      timeSelect.append(new Option('Неделя е почивен ден', ''));
      timeSelect.disabled = true;
      setFieldError('date', 'Неделя е почивен ден. Моля, изберете дата от понеделник до събота.');
      return;
    }

    clearFieldError('date');

    // If booking for today, require at least 30 minutes lead time
    const isToday = selectedIsoDate === sofia.isoDate;
    const earliestMinutes = isToday
      ? Math.max(schedule.open, Math.ceil((sofia.minutesNow + 30) / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES)
      : schedule.open;

    const slots = [];
    for (let m = earliestMinutes; m <= schedule.lastSlot; m += SLOT_INTERVAL_MINUTES) {
      slots.push(formatMinutes(m));
    }

    if (slots.length === 0) {
      timeSelect.append(new Option('Няма свободни часове за днес', ''));
      timeSelect.disabled = true;
      setFieldError('date', 'За днес вече няма свободни часове. Моля, изберете друг ден.');
      return;
    }

    timeSelect.disabled = false;
    timeSelect.append(new Option('Изберете час…', ''));
    slots.forEach((slot) => {
      timeSelect.append(new Option(slot, slot));
    });
  }

  function setFieldError(key, message) {
    const input = fields[key];
    const errorEl = errorEls[key];
    if (!input || !errorEl) return;

    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
  }

  function clearFieldError(key) {
    const input = fields[key];
    const errorEl = errorEls[key];
    if (!input || !errorEl) return;

    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
  }

  function validateField(key) {
    const input = fields[key];
    if (!input) return true;
    const value = input.value.trim();

    switch (key) {
      case 'name': {
        if (value.length < 2) {
          setFieldError('name', 'Моля, въведете вашето име (поне 2 символа).');
          return false;
        }
        break;
      }

      case 'phone': {
        const cleaned = value.replace(/[\s\-()]/g, '');
        // Accepts Bulgarian mobile/landline (08xxxxxxxx, +3598xxxxxxxx) or international (+...)
        const phoneRegex = /^(\+359|00359|0)\d{8,9}$|^\+\d{9,15}$/;
        if (!phoneRegex.test(cleaned)) {
          setFieldError('phone', 'Моля, въведете валиден телефонен номер (напр. 0888 123 456).');
          return false;
        }
        break;
      }

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!emailRegex.test(value)) {
          setFieldError('email', 'Моля, въведете валиден имейл адрес.');
          return false;
        }
        break;
      }

      case 'service': {
        if (!value) {
          setFieldError('service', 'Моля, изберете желаната услуга.');
          return false;
        }
        break;
      }

      case 'date': {
        if (!value) {
          setFieldError('date', 'Моля, изберете предпочитана дата.');
          return false;
        }
        const sofia = getSofiaNow();
        if (value < sofia.isoDate) {
          setFieldError('date', 'Избраната дата не може да бъде в миналото.');
          return false;
        }
        const weekday = parseIsoDate(value).getDay();
        if (!WORKING_HOURS[weekday]) {
          setFieldError('date', 'Неделя е почивен ден. Моля, изберете друг ден.');
          return false;
        }
        break;
      }

      case 'time': {
        if (!value) {
          setFieldError('time', 'Моля, изберете предпочитан час.');
          return false;
        }
        break;
      }

      default:
        break;
    }

    clearFieldError(key);
    return true;
  }

  function validateForm() {
    const keys = ['name', 'phone', 'email', 'service', 'date', 'time'];
    let firstInvalidKey = null;

    keys.forEach((key) => {
      const valid = validateField(key);
      if (!valid && !firstInvalidKey) {
        firstInvalidKey = key;
      }
    });

    if (firstInvalidKey && fields[firstInvalidKey]) {
      fields[firstInvalidKey].focus();
      return false;
    }

    return true;
  }

  /* =========================================================================
     7. OWNER EMAIL NOTIFICATION ADAPTER
     -------------------------------------------------------------------------
     Builds a clean payload ready to be emailed to the barbershop owner via
     Formspree, EmailJS, or any custom webhook/backend endpoint.
     ========================================================================= */
  function buildBookingPayload() {
    const formattedDate = formatBulgarianDate(fields.date.value);
    const service = fields.service.value;
    const time = fields.time.value;

    return {
      shop: BOOKING_CONFIG.shopName,
      ownerEmail: BOOKING_CONFIG.ownerEmail,
      subject: `Нова заявка за час — ${service} (${formattedDate}, ${time})`,
      client: {
        name: fields.name.value.trim(),
        phone: fields.phone.value.trim(),
        email: fields.email.value.trim(),
      },
      appointment: {
        service,
        dateIso: fields.date.value,
        dateFormattedBg: formattedDate,
        time,
      },
      submittedAt: new Date().toISOString(),
    };
  }

  async function sendBookingNotification(payload) {
    if (BOOKING_CONFIG.mode === 'demo' || !BOOKING_CONFIG.endpoint) {
      // Local preview mode: simulates network latency and logs the structured payload
      await new Promise((resolve) => setTimeout(resolve, 450));
      console.info('[GRAVITY FADE] Подготвена заявка за имейл известие:', payload);
      return { ok: true, mode: 'demo' };
    }

    // Formspree / custom JSON webhook delivery
    const requestBody =
      BOOKING_CONFIG.mode === 'formspree'
        ? {
            _subject: payload.subject,
            _replyto: payload.client.email,
            Име: payload.client.name,
            Телефон: payload.client.phone,
            Имейл: payload.client.email,
            Услуга: payload.appointment.service,
            Дата: payload.appointment.dateFormattedBg,
            Час: payload.appointment.time,
          }
        : payload;

    const response = await fetch(BOOKING_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return { ok: true, mode: BOOKING_CONFIG.mode };
  }

  /* =========================================================================
     8. CONFIRMATION VIEW & FORM INITIALIZATION
     ========================================================================= */
  function showConfirmation(payload) {
    document.getElementById('confirmName').textContent = payload.client.name;
    document.getElementById('confirmService').textContent = payload.appointment.service;
    document.getElementById('confirmDateTime').textContent = `${payload.appointment.dateFormattedBg}, ${payload.appointment.time} ч.`;
    document.getElementById('confirmPhone').textContent = payload.client.phone;
    document.getElementById('confirmEmail').textContent = payload.client.email;

    bookingForm.hidden = true;
    confirmationBox.hidden = false;
    confirmationBox.focus();
  }

  function resetToForm() {
    bookingForm.reset();
    Object.keys(fields).forEach(clearFieldError);
    if (formAlert) {
      formAlert.hidden = true;
      formAlert.textContent = '';
    }
    confirmationBox.hidden = true;
    bookingForm.hidden = false;
    initDefaultDate();
  }

  function initDefaultDate() {
    if (!fields.date) return;
    const sofia = getSofiaNow();
    fields.date.min = sofia.isoDate;

    // Default to today if open and slots remain, otherwise the next working day
    const candidate = parseIsoDate(sofia.isoDate);
    for (let offset = 0; offset < 7; offset += 1) {
      const checkDate = new Date(candidate);
      checkDate.setDate(candidate.getDate() + offset);
      const iso = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      const schedule = WORKING_HOURS[checkDate.getDay()];
      if (!schedule) continue;

      if (offset === 0 && sofia.minutesNow + 30 > schedule.lastSlot) {
        continue;
      }

      fields.date.value = iso;
      populateTimeSlots(iso);
      return;
    }
  }

  function initBookingForm() {
    if (!bookingForm) return;

    initDefaultDate();

    fields.date.addEventListener('change', () => {
      populateTimeSlots(fields.date.value);
      clearFieldError('time');
    });

    // Clear errors interactively as the user corrects inputs
    Object.keys(fields).forEach((key) => {
      const eventName = fields[key].tagName === 'SELECT' || key === 'date' ? 'change' : 'input';
      fields[key].addEventListener(eventName, () => {
        if (fields[key].getAttribute('aria-invalid') === 'true') {
          validateField(key);
        }
      });
    });

    bookingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (formAlert) {
        formAlert.hidden = true;
        formAlert.textContent = '';
      }

      if (!validateForm()) return;

      const payload = buildBookingPayload();
      const btnLabel = submitBtn.querySelector('.btn-label');
      const originalText = btnLabel ? btnLabel.textContent : '';

      submitBtn.disabled = true;
      if (btnLabel) btnLabel.textContent = 'Изпращане…';

      try {
        await sendBookingNotification(payload);
        showConfirmation(payload);
      } catch (error) {
        console.error('[GRAVITY FADE] Грешка при изпращане:', error);
        if (formAlert) {
          formAlert.textContent =
            'Възникна проблем при изпращането на заявката. Моля, опитайте отново или ни се обадете на +359 888 123 456.';
          formAlert.hidden = false;
        }
      } finally {
        submitBtn.disabled = false;
        if (btnLabel) btnLabel.textContent = originalText;
      }
    });

    if (newBookingBtn) {
      newBookingBtn.addEventListener('click', () => {
        resetToForm();
        fields.name?.focus();
      });
    }
  }

  /* =========================================================================
     9. BOOTSTRAP
     ========================================================================= */
  if (currentYearEl) {
    currentYearEl.textContent = String(new Date().getFullYear());
  }

  initHeader();
  updateLiveOpenStatus();
  initServiceQuickSelect();
  initBookingForm();
})();
