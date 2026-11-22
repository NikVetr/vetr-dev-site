import { get, make, button, setPressed, readLocal, writeLocal } from './dom.js';

const feedback = get('feedback', 'dialog');
const delay = get('delay', 'select');
const status = get('feedback-status', 'output');
const notify = get('notify', 'button');
const follow = get('later', 'section');
let pending = readLocal('check-in', null);
let current = null;
let timer = 0;
let preferences = {},
  onPreference;
const feelings = { better: 'Better', same: 'About the same', worse: 'Worse' };

function savePending() {
  if (!writeLocal('check-in', pending))
    status.textContent =
      'This browser could not save the check-in. A calendar reminder can still be downloaded.';
}
function storeSession() {
  if (current && !writeLocal('last-session', current))
    status.textContent = 'This session can only be kept while the page is open.';
}
function laterResult(value) {
  if (current?.startedAt === pending.session.startedAt) current.laterFeeling = value;
  writeLocal('last-check-in', { ...pending.session, laterFeeling: value, checkedAt: Date.now() });
  pending = null;
  savePending();
  armCheckIn();
}
function armCheckIn() {
  clearTimeout(timer);
  follow.hidden = true;
  if (!pending) return;
  const left = pending.due - Date.now();
  if (left > 0) {
    get('later-title', 'h2').textContent = 'Scheduled check-in';
    get('later-context', 'p').textContent = new Date(pending.due).toLocaleString([], {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    get('later-buttons', 'div').replaceChildren(
      button('Cancel check-in', () => {
        pending = null;
        savePending();
        armCheckIn();
      }),
    );
    follow.hidden = false;
    timer = window.setTimeout(armCheckIn, Math.min(left, 2147483647));
    return;
  }
  get('later-title', 'h2').textContent = 'How are you feeling now?';
  get('later-context', 'p').textContent =
    'After your ' +
    pending.session.locationName +
    ' routine at ' +
    new Date(pending.session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
    '.';
  get('later-buttons', 'div').replaceChildren(
    ...Object.entries(feelings).map(([id, label]) => button(label, () => laterResult(id))),
    button('Dismiss', () => laterResult('dismissed')),
  );
  follow.hidden = false;
  if (pending.notify && !pending.sent && 'Notification' in window && Notification.permission === 'granted') {
    pending.sent = true;
    savePending();
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) =>
        reg?.showNotification('Stretch Snack check-in', {
          body: 'How are you feeling after your movement break?',
          tag: 'stretch-snack-check-in',
        }),
      )
      .catch(() => {});
  }
}
function chooseReminder() {
  if (!current) return;
  const minutes = Number(delay.value);
  if (!minutes && pending?.session.startedAt !== current.startedAt) return;
  pending = minutes
    ? { due: Date.now() + minutes * 60000, session: { ...current }, notify: false, sent: false }
    : null;
  get('reminder-options', 'div').hidden = !pending;
  notify.disabled = false;
  status.textContent = pending
    ? 'Check-in set for ' +
      new Date(pending.due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
      '.'
    : 'Check-in canceled.';
  savePending();
  armCheckIn();
}
function saveCalendar() {
  if (!pending) return;
  const utc = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const appUrl = new URL('./', location.href).href.replace(/[\n\r]/g, '');
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vetr.dev//Stretch Snack//EN',
    'BEGIN:VEVENT',
    'UID:stretch-' + pending.due + '@vetr.dev',
    'DTSTAMP:' + utc(Date.now()),
    'DTSTART:' + utc(pending.due),
    'DTEND:' + utc(pending.due + 300000),
    'SUMMARY:Stretch Snack check-in',
    'DESCRIPTION:How do you feel after your movement break?',
    'URL:' + appUrl,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Stretch Snack check-in',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const link = make('a');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  link.href = url;
  link.download = 'stretch-snack-check-in.ics';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function setupCheckIn(savedPreferences, onChange) {
  preferences = savedPreferences;
  onPreference = onChange;
  notify.hidden = !('Notification' in window && 'serviceWorker' in navigator);
  delay.addEventListener('change', chooseReminder);
  get('calendar', 'button').addEventListener('click', saveCalendar);
  notify.addEventListener('click', async () => {
    if (!pending) return;
    const selected = pending;
    try {
      const permission = await Notification.requestPermission();
      if (pending !== selected) return;
      if (permission !== 'granted') {
        status.textContent = 'Notifications are unavailable. Use a calendar reminder instead.';
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        status.textContent = 'Notifications need an active offline installation. Use a calendar reminder.';
        return;
      }
      pending.notify = true;
      savePending();
      notify.disabled = true;
      status.textContent = 'Notifications enabled while the app is open.';
    } catch {
      status.textContent = 'This browser could not enable notifications. Use a calendar reminder.';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) armCheckIn();
  });
  armCheckIn();
}
export function showFeedback(attempted, locationName) {
  current = { startedAt: Date.now(), ids: attempted.map((m) => m.id), locationName, feeling: null };
  status.textContent = '';
  storeSession();
  get('completed-info', 'p').textContent = attempted.length
    ? 'You tried ' + attempted.length + (attempted.length === 1 ? ' movement.' : ' movements.')
    : 'Session ended before a movement was tried.';
  const overall = get('immediate', 'div');
  overall.replaceChildren(
    ...Object.entries(feelings).map(([id, label]) => {
      const item = button(label, () => {
        current.feeling = id;
        storeSession();
        if (pending?.session.startedAt === current.startedAt) {
          pending.session.feeling = id;
          savePending();
        }
        overall.querySelectorAll('button').forEach((b) => setPressed(b, b === item));
      });
      setPressed(item, false);
      return item;
    }),
  );
  overall.parentElement.hidden = !attempted.length;
  const rows = attempted.map((move) => {
    const row = make('div', '', 'feedback-item'),
      label = make('label', move.name),
      select = make('select');
    select.id = 'feedback-' + move.id;
    label.htmlFor = select.id;
    for (const [id, name] of Object.entries({
      '': 'No feedback',
      helped: 'Helped',
      'poor-fit': 'Poor fit',
      uncomfortable: 'Uncomfortable',
    }))
      select.add(new Option(name, id));
    select.value = preferences[move.id] || '';
    select.addEventListener('change', () => {
      if (select.value) preferences[move.id] = select.value;
      else delete preferences[move.id];
      if (!writeLocal('movement-feedback', preferences))
        status.textContent = 'Feedback will apply while this page is open.';
      onPreference();
    });
    row.append(label, select);
    return row;
  });
  get('feedback-items', 'div').replaceChildren(...rows);
  delay.value = '0';
  delay.parentElement.parentElement.hidden = !attempted.length;
  get('reminder-options', 'div').hidden = true;
  feedback.showModal();
}
