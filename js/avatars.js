'use strict';

const pokerAvatars = (() => {
  const groups = [
    ['neon', 'Neonowe', [
      'male', 'female', 'male', 'female',
      'neutral', 'female', 'male', 'male',
      'female', 'male', 'female', 'female'
    ]],
    ['rick', 'Komiksowe', [
      'male', 'female', 'male', 'female',
      'male', 'male', 'female', 'neutral',
      'neutral', 'male', 'female', 'male'
    ]],
    ['mafia', 'Mafia', [
      'male', 'male', 'female', 'male',
      'female', 'male', 'male', 'female',
      'female', 'male', 'male', 'male'
    ]]
  ].map(([groupId, label, genders]) => ({
    label,
    presets: genders.map((gender, index) => ({ id: `${groupId}-${index + 1}`, gender }))
  }));
  const presetGenders = new Map(groups.flatMap(group => group.presets.map(({ id, gender }) => [id, gender])));
  const femaleNames = new Set(`
    ada adrianna aga agata agnieszka aleksandra alicja amelia angelika ania anita anna asia barbara basia beata dagmara danuta daria
    dominika dorota edyta eliza elzbieta emilia ewa gabriela gosia grazyna hania hanna helena iga ilona iwona iza
    izabela jagoda joanna judyta julia julka justyna kamila karolina kasia katarzyna kinga klaudia krystyna laura lena
    lidia lucja magda magdalena maja malgosia malgorzata maria mariola marta martyna marysia michalina monika natalia ola olga oliwia patrycja
    paulina renata roksana sabina sylwia teresa ula urszula walentyna weronika wiktoria zaneta zofia zosia zuza zuzanna
  `.trim().split(/\s+/));
  const maleNames = new Set(`
    adam adrian aleksander andrzej antek antoni arek arkadiusz artur bartek bartlomiej bartosz blazej bogdan
    borys chris cyprian damian daniel dawid dominik edward emil ernest fabian feliks filip franek franciszek
    grzesiek grzegorz henryk hubert ignacy jacek jakub jan janek janusz jaroslaw jerzy kacper kajetan kamil karol
    konrad krystian krzysiek krzysztof kuba leon lucas lukasz maciej maks maksymilian marcin marek mariusz mateusz
    michal mikolaj milosz olaf oskar patryk pawel piotr przemek przemyslaw rafal robert roman sebastian
    stanislaw szymon tadeusz tomek tomasz tymon tymoteusz wiktor witold wojciech wojtek zbigniew
  `.trim().split(/\s+/));
  const isPreset = value => presetGenders.has(value);
  const isUpload = value => typeof value === 'string' && /^data:image\/(?:png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);

  function genderForName(name) {
    const firstName = name.trim().toLocaleLowerCase('pl-PL').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replaceAll('ł', 'l').split(/[\s-]+/, 1)[0];
    if (femaleNames.has(firstName)) return 'female';
    if (maleNames.has(firstName)) return 'male';
    return null;
  }

  function setPreset(element, value) {
    if (isPreset(value)) element.dataset.avatarPreset = value;
    else delete element.dataset.avatarPreset;
  }

  function fillSeatAvatars(players, reserved) {
    const used = new Set();
    const missing = [];
    for (const player of players) {
      const gender = genderForName(player.name);
      const avatarGender = presetGenders.get(player.avatar);
      if (!avatarGender || (gender && avatarGender !== gender) || used.has(player.avatar)) {
        missing.push({ player, gender });
        continue;
      }
      used.add(player.avatar);
    }
    if (!missing.length) return;
    const available = pokerCards.shuffled([...presetGenders.keys()].filter(avatar => avatar !== reserved && !used.has(avatar)));
    for (const { player, gender } of missing) {
      const index = available.findIndex(avatar => !gender || presetGenders.get(avatar) === gender);
      player.avatar = index === -1 ? null : available.splice(index, 1)[0];
    }
  }

  return { groups, isPreset, isUpload, setPreset, fillSeatAvatars };
})();
