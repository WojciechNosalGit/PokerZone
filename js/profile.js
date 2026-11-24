'use strict';

function createPokerProfile(dialog, onSave) {
  const storageKey = 'poker-lab-player-profile';
  const normalizeName = value => (typeof value === 'string' ? value.trim().slice(0, 24) : '') || 'Ty';
  const { groups, isPreset, isUpload, setPreset, setAvatar } = pokerAvatars;
  const genderLabels = { male: 'męski', female: 'żeński', neutral: 'neutralny' };
  const form = dialog.querySelector('#profile-form');
  const name = dialog.querySelector('#profile-name');
  const file = dialog.querySelector('#profile-avatar');
  const preview = dialog.querySelector('#profile-avatar-preview');
  const random = dialog.querySelector('#random-avatar');
  const gallery = dialog.querySelector('#profile-avatar-gallery');
  const save = dialog.querySelector('#save-profile');
  const status = dialog.querySelector('#profile-status');
  let profile = { name: 'Ty', avatar: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      profile = {
        name: normalizeName(saved.name),
        avatar: isPreset(saved.avatar) || isUpload(saved.avatar) ? saved.avatar : ''
      };
    }
  } catch {
    // Ustawienia domyślne są dostępne również przy niedostępnym zapisie.
  }

  let draftAvatar = '';
  let randomAvatar = null;
  let upload = 0;

  const choices = groups.flatMap(({ label, presets }) => {
    const category = document.createElement('fieldset');
    category.className = 'profile-avatar-presets';
    const title = document.createElement('legend');
    title.textContent = label;
    const options = document.createElement('div');
    options.className = 'profile-avatar-options';
    category.append(title, options);
    gallery.append(category);

    return presets.map(({ id: avatar, gender }, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-avatar-option';
      button.title = `${label}, avatar ${index + 1} (${genderLabels[gender]})`;
      button.setAttribute('aria-label', button.title);
      setPreset(button, avatar);
      button.addEventListener('click', () => selectAvatar(avatar));
      options.append(button);
      return button;
    });
  });

  function showStatus(message = '') {
    status.textContent = message;
    status.hidden = !message;
  }

  function updatePreview() {
    setAvatar(preview, draftAvatar || randomAvatar);
    random.disabled = !draftAvatar;
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
    name.value = player?.name ?? profile.name;
    file.value = '';
    draftAvatar = player ? (player.avatarSelected ? player.avatar : '') : profile.avatar;
    randomAvatar = player && !player.avatarSelected ? player.avatar : null;
    save.disabled = false;
    showStatus();
    updatePreview();
    dialog.showModal();
    form.scrollTop = 0;
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

  random.addEventListener('click', () => selectAvatar(''));

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (save.disabled) return;
    const updated = { name: normalizeName(name.value), avatar: draftAvatar };
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
