'use strict';

function pokerProfileNickname({ name, nameSelected }) {
  const nickname = typeof name === 'string' ? name.trim().slice(0, 24) : '';
  const hasName = nameSelected ?? (nickname !== 'Ty');
  return hasName ? nickname : '';
}

function createPokerProfile(dialog, onSave) {
  const storageKey = 'poker-lab-player-profile';
  const profileWithNickname = (nickname, avatar) => ({ name: nickname || 'Ty', nameSelected: Boolean(nickname), avatar });
  const { groups, isPreset, isUpload, setPreset, setAvatar } = pokerAvatars;
  const genderLabels = { male: 'męski', female: 'żeński', neutral: 'neutralny' };
  const form = dialog.querySelector('#profile-form');
  const name = dialog.querySelector('#profile-name');
  const file = dialog.querySelector('#profile-avatar');
  const preview = dialog.querySelector('#profile-avatar-preview');
  const defaultAvatar = dialog.querySelector('#default-avatar');
  const gallery = dialog.querySelector('#profile-avatar-gallery');
  const save = dialog.querySelector('#save-profile');
  const status = dialog.querySelector('#profile-status');
  let profile = profileWithNickname('', '');
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      const avatar = isPreset(saved.avatar) || isUpload(saved.avatar) ? saved.avatar : '';
      profile = profileWithNickname(pokerProfileNickname(saved), avatar);
    }
  } catch {
    // Ustawienia domyślne są dostępne również przy niedostępnym zapisie.
  }

  let draftAvatar = '';
  let upload = 0;

  const rows = groups.map(({ id, label, presets }) => {
    const category = document.createElement('fieldset');
    category.className = 'profile-avatar-presets';
    const title = document.createElement('legend');
    title.textContent = label;
    const row = document.createElement('div');
    row.className = 'profile-avatar-row';
    const options = document.createElement('div');
    options.className = 'profile-avatar-options';
    options.id = `profile-avatars-${id}`;

    const choices = presets.map(({ id: avatar, gender }, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-avatar-option';
      const description = `${label}, avatar ${index + 1} (${genderLabels[gender]})`;
      button.dataset.tooltip = description;
      button.setAttribute('aria-label', description);
      setPreset(button, avatar);
      button.addEventListener('click', () => selectAvatar(avatar));
      return button;
    });
    options.append(...choices);

    function arrow(direction, text, symbol) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'raise-step profile-avatar-arrow';
      button.textContent = symbol;
      button.setAttribute('aria-label', `${label}: przewiń ${text}`);
      button.setAttribute('aria-controls', options.id);
      button.setAttribute('aria-disabled', 'true');
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        const step = choices[1].offsetLeft - choices[0].offsetLeft;
        const visible = Math.max(1, Math.floor(options.clientWidth / step));
        options.scrollBy({ left: direction * visible * step });
      });
      return button;
    }

    const previous = arrow(-1, 'w lewo', '‹');
    const next = arrow(1, 'w prawo', '›');
    function updateArrows() {
      const maxScroll = options.scrollWidth - options.clientWidth;
      previous.setAttribute('aria-disabled', String(options.scrollLeft <= 1));
      next.setAttribute('aria-disabled', String(options.scrollLeft >= maxScroll - 1));
    }
    options.addEventListener('scroll', updateArrows);
    row.append(previous, options, next);
    category.append(title, row);
    gallery.append(category);
    return { options, choices, updateArrows };
  });
  const choices = rows.flatMap(row => row.choices);
  window.addEventListener('resize', () => {
    if (dialog.open) rows.forEach(row => row.updateArrows());
  });

  function showStatus(message = '') {
    status.textContent = message;
    status.hidden = !message;
  }

  function updatePreview() {
    setAvatar(preview, draftAvatar);
    defaultAvatar.disabled = !draftAvatar;
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.avatarPreset === draftAvatar));
  }

  function selectAvatar(avatar) {
    upload++;
    file.value = '';
    draftAvatar = avatar;
    save.disabled = false;
    showStatus();
    updatePreview();
  }

  function open(player) {
    if (dialog.open) return;
    upload++;
    name.value = pokerProfileNickname(player ?? profile);
    file.value = '';
    draftAvatar = player ? (player.avatarSelected ? player.avatar : '') : profile.avatar;
    save.disabled = false;
    showStatus();
    updatePreview();
    dialog.showModal();
    form.scrollTop = 0;
    for (const { options, choices, updateArrows } of rows) {
      const selected = choices.find(button => button.dataset.avatarPreset === draftAvatar);
      if (selected) options.scrollTo({ left: selected.offsetLeft - choices[0].offsetLeft, behavior: 'instant' });
      updateArrows();
    }
  }

  async function avatarThumbnail(selectedFile) {
    const url = URL.createObjectURL(selectedFile);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const { naturalWidth: width, naturalHeight: height } = image;
      const side = Math.min(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      canvas.getContext('2d').drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 160, 160);
      const avatar = canvas.toDataURL('image/webp', 0.86);
      if (!isUpload(avatar)) throw new Error('Nieobsługiwany obraz.');
      return avatar;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  file.addEventListener('change', async () => {
    const selectedFile = file.files[0];
    if (!selectedFile) return;
    const request = ++upload;
    save.disabled = true;
    showStatus();
    try {
      const avatar = await avatarThumbnail(selectedFile);
      if (request !== upload || !dialog.open) return;
      draftAvatar = avatar;
      updatePreview();
    } catch {
      if (request === upload && dialog.open) showStatus('Nie udało się wczytać obrazu.');
    } finally {
      if (request === upload) {
        file.value = '';
        save.disabled = false;
      }
    }
  });

  defaultAvatar.addEventListener('click', () => selectAvatar(''));

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (save.disabled) return;
    const updated = profileWithNickname(pokerProfileNickname({ name: name.value, nameSelected: true }), draftAvatar);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      showStatus('Nie udało się zapisać profilu w tej przeglądarce.');
      return;
    }
    profile = updated;
    onSave(profile);
    dialog.close();
  });
  for (const button of dialog.querySelectorAll('#cancel-profile, #close-profile')) {
    button.addEventListener('click', () => dialog.close());
  }

  return { open, current: () => profile };
}
