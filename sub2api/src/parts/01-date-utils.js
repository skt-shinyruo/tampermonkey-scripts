  function getDatePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    return {
      day: parts.day,
      month: parts.month,
      year: parts.year,
    };
  }

  function getTodayIsoDate(timeZone) {
    return formatIsoDateFromParts(getDatePartsInTimeZone(new Date(), timeZone));
  }

  function shiftIsoDate(dateText, offsetDays) {
    const [year, month, day] = String(dateText || '')
      .split('-')
      .map(Number);
    if (!year || !month || !day) {
      return '';
    }

    const shiftedDate = new Date(Date.UTC(year, month - 1, day));
    shiftedDate.setUTCDate(shiftedDate.getUTCDate() + offsetDays);
    return shiftedDate.toISOString().slice(0, 10);
  }

  function getStartOfMonthIsoDate(dateText) {
    const [year, month] = String(dateText || '')
      .split('-')
      .map(Number);
    if (!year || !month) {
      return '';
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  }

  function getEndOfPreviousMonthIsoDate(dateText) {
    const firstDayOfMonth = getStartOfMonthIsoDate(dateText);
    if (!firstDayOfMonth) {
      return '';
    }
    return shiftIsoDate(firstDayOfMonth, -1);
  }

  function resolvePresetRange(label, timeZone) {
    const today = getTodayIsoDate(timeZone);
    if (!today) {
      return null;
    }

    switch (String(label || '').trim()) {
      case '今天':
        return { start: today, end: today };
      case '昨天': {
        const yesterday = shiftIsoDate(today, -1);
        return { start: yesterday, end: yesterday };
      }
      case '近24小时':
        return { start: shiftIsoDate(today, -1), end: today };
      case '近 7 天':
        return { start: shiftIsoDate(today, -6), end: today };
      case '近 14 天':
        return { start: shiftIsoDate(today, -13), end: today };
      case '近 30 天':
        return { start: shiftIsoDate(today, -29), end: today };
      case '本月':
        return { start: getStartOfMonthIsoDate(today), end: today };
      case '上月': {
        const previousMonthEnd = getEndOfPreviousMonthIsoDate(today);
        return {
          start: getStartOfMonthIsoDate(previousMonthEnd),
          end: previousMonthEnd,
        };
      }
      default:
        return null;
    }
  }

  function resolveSavedRange(savedRange, timeZone) {
    if (!savedRange) {
      return null;
    }

    if (savedRange.type === 'custom') {
      return savedRange.start && savedRange.end
        ? {
            end: savedRange.end,
            start: savedRange.start,
          }
        : null;
    }

    if (savedRange.type === 'preset') {
      return resolvePresetRange(savedRange.label, timeZone);
    }

    return null;
  }

  function isPageVisible() {
    return document.visibilityState === 'visible';
  }

  function isPageForeground() {
    return isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH) && isUsageAutoRefreshPage() && isPageVisible() && document.hasFocus();
  }

