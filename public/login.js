const colors = ['#f1b9f3', '#dce58a', '#acd6f5', '#eb6024', '#29584c'];
const letterColors = [0, 1, 2, 3, 0, 1, 3, 0, 1, 2, 3, 0];

export function mountLogin(container, headline, people, choose) {
  container.innerHTML = `<section class="login">
    <h1>3 כוכבים <span>בחוץ</span></h1>
    <div class="kicker celebration" role="heading" aria-level="2"><span aria-hidden="true"></span></div>
    <h2>מי אתה?</h2>
    <input id="name-search" aria-label="חיפוש השם שלי" placeholder="השם שלי">
    <div class="names"></div>
    <p class="note">השם שבחרת יופיע לצד הבחירות שלך בסטטיסטיקות.</p>
  </section>`;
  const celebration = container.querySelector('.celebration');
  celebration.setAttribute('aria-label', headline);
  const letters = celebration.firstElementChild;
  let colorIndex = 0;
  for (const character of headline) {
    if (character === ' ') {
      letters.append(' ');
      continue;
    }
    const letter = document.createElement('span');
    letter.textContent = character;
    letter.style.setProperty('--letter-color', colors[letterColors[colorIndex++ % letterColors.length]]);
    letters.append(letter);
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const shower = document.createElement('div');
    shower.className = 'confetti-shower';
    shower.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 55; i++) {
      const piece = document.createElement('i');
      piece.style.cssText = `--x:${(i * 37) % 100}%;--y:${-15 + (i * 17) % 75}vh;--drift:${(i % 2 ? 1 : -1) * (15 + (i * 13) % 45)}px;--rotation:${(i * 47) % 360}deg;--color:${colors[i % colors.length]};--size:${6 + (i % 4) * 2}px`;
      shower.append(piece);
    }
    container.append(shower);
    setTimeout(() => shower.remove(), 3000);
  }

  const names = container.querySelector('.names');
  const search = container.querySelector('#name-search');
  let choosing = false;

  function showNames() {
    const matches = people.filter(person => person.name.includes(search.value.trim()));
    names.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = 'לא נמצא שם';
      names.append(empty);
    }
    for (const person of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'person';
      button.dataset.person = person.id;
      button.textContent = person.name;
      button.onclick = async () => {
        if (choosing) return;
        choosing = true;
        button.disabled = true;
        try {
          await choose(person.id);
        } finally {
          choosing = false;
          button.disabled = false;
        }
      };
      names.append(button);
    }
  }

  search.addEventListener('input', showNames);
  showNames();
}
