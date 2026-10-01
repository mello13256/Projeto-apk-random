# 🥔 Horta Hostil

Jogo para **Android** no estilo *Brotato*: um roguelite de arena em que você é um
legume armado até os dentes, sobrevivendo a ondas de insetos que invadiram a horta.

![Menu](docs/v2_01_menu.png)

## 📲 Como instalar no celular

1. Baixe o arquivo **[`HortaHostil.apk`](HortaHostil.apk)** (clique nele no GitHub e depois em *Download raw file*).
2. Abra o arquivo no celular. Se o Android pedir, permita **"instalar apps de fontes desconhecidas"**.
3. Instale e jogue! (Precisa de Android 7.0 ou mais novo. O jogo roda deitado, na horizontal.)

> O Play Protect pode avisar que o app é "desconhecido". É normal: o app não veio da Play Store.
> É só tocar em *Instalar mesmo assim*.

## 🌐 Jogar online (PC e celular)

### ▶️ **https://mello13256.github.io/Projeto-apk-random/**

O mesmo jogo (versão 2.1, com tudo do APK) roda no navegador do **computador e do celular**,
publicado pelo **GitHub Pages**. Ele funciona até sem internet depois da primeira visita e pode ser
**instalado como aplicativo**:

- **No computador (Chrome/Edge):** clique no ícone de instalar (⊕) na barra de endereço.
- **No Android (Chrome):** menu ⋮ → **Instalar app**. Ou toque em **Baixar app Android** no menu do jogo para pegar o APK.
- **No iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.

No APK, o botão **Jogar online** do menu abre esse site.

O jogo percebe sozinho se você está usando teclado/mouse ou toque e muda os controles e as dicas:

| | Computador | Celular / tablet |
|---|---|---|
| Andar | `W A S D` ou setas (ou arrastar o mouse) | arrastar o dedo (joystick) |
| Pausar | `Esc` ou `P` | botão **II** |
| Personagem / dificuldade | setas, `Q`/`E` = dificuldade, `Enter` = começar | tocar |
| Melhorias / loja | clique ou teclas `1`–`4`, `R` = rolar, `Enter` = próxima onda | tocar nos cartões |
| Caixas | `Enter` = pegar, `R` = reciclar | tocar |
| Ver o que um item faz | passar o mouse | tocar no item |
| Tela cheia | `F` ou botão do menu | automática ao tocar em **Jogar** |

No celular o jogo fica sempre deitado: se o aparelho estiver em pé (ou com a rotação automática
desligada), ele é desenhado de lado, é só virar o celular.

**Como a publicação funciona:** o workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
roda a cada push que muda a pasta `pwa/` ou o APK, copia o `HortaHostil.apk` junto e publica tudo no
GitHub Pages (em *Settings → Pages*, a origem é **GitHub Actions**).

Para testar no seu computador sem publicar: `npx http-server pwa` e abra `http://localhost:8080`.
Para o robô jogar sozinho com a versão JavaScript: `node pwa/sim.js 20`.

## 🏆 Ranking online

No menu, **🏆 Ranking** mostra os 20 melhores de cada dificuldade (do site e do APK juntos).
No fim de cada partida, **Enviar pro ranking** pede um nome (2 a 16 letras) e envia a partida.
A ordem é: quem venceu, depois a onda alcançada e por último os insetos derrotados.

O ranking fica no **Firebase Realtime Database** (plano gratuito), acessado direto pela API REST,
sem bibliotecas (`pwa/js/ranking.js` no site e `Ranking.java` no APK). As **regras de segurança**
do banco (em [`firebase-rules.json`](firebase-rules.json)) deixam qualquer um ler e enviar
pontuações, mas ninguém consegue editar ou apagar, e dados inválidos são recusados.

## 🎮 Como jogar

- **Arraste o dedo** em qualquer lugar da tela para andar (joystick virtual).
- Suas armas (até 6!) **atacam sozinhas** o inimigo mais próximo.
- Os insetos derrotados soltam **sementes 🌱**, que servem de dinheiro **e** de experiência.
- Sobreviva até o **tempo da onda** acabar. São **20 ondas**, com chefões nas ondas 10 e 20.
- Entre as ondas:
  - **Subiu de nível?** Escolha uma entre 4 melhorias de atributo.
  - **Loja:** compre armas e itens, **tranque** 🔒 o que quiser guardar pra próxima, ou **role** a loja.
  - Toque numa arma sua para **vender** ou **combinar**: duas armas iguais do mesmo nível viram uma de nível maior (I → II → III → IV).

| Escolha do personagem | Em jogo (elite 👑, caixa 📦, vida baixa) |
|---|---|
| ![Personagens](docs/v2_03_chars.png) | ![Jogando](docs/v2_04_playing.png) |
| **Caixa no fim da onda** | **Loja** |
| ![Caixa](docs/v2_06_crate.png) | ![Loja](docs/v2_07_shop.png) |

### Novidades da versão 2.0

- **3 personagens novos para desbloquear:** 🎃 Abóbora Blindada (chegue na onda 10),
  🥒 Pepino Arqueiro (derrote 2000 insetos no total) e 🍄 Cogumelo Místico (vença 1 partida).
  Também dá pra escolher **🎲 Aleatório**.
- **4 dificuldades:** Fácil, Normal, Difícil e Pesadelo (o jogo marca ✔ nas que você já venceu).
- **3 armas novas:** 🔨 Martelo (arremessa longe), 🏹 Arco (atravessa 2 inimigos) e
  ❄️ Varinha de Gelo (deixa os inimigos lentos).
- **Inimigo novo:** 🦋 Mariposa, que voa em zigue-zague.
- **Elites 👑:** versões douradas e bem mais fortes dos insetos (a partir da onda 5).
  Sempre deixam uma **caixa 📦**.
- **Caixas:** no fim da onda, cada caixa vira um item grátis (ou pode ser reciclada por sementes).
- **6 itens com efeitos especiais:** 🌀 Redemoinho (pega sementes de mais longe),
  🍌 Banana (frutas curam mais), 🌹 Rosa (espinhos), 🗺️ Mapa do Tesouro (mais caixas),
  🎆 Fogos e 🌋 Vulcão (inimigos explodem ao morrer).
- **Continuar depois:** a partida é salva na loja. Se fechar o app, aparece **Continuar** no menu.
- **Música de fundo** gerada por código (e botão para desligar).
- **Fim de onda animado:** os insetos somem e as sementes voam até você.
- **Aviso de vida baixa:** as bordas da tela piscam em vermelho.
- **Dano de cada arma:** aparece na pausa, na loja e no fim da partida.
- **Toque num item** para ver o que ele faz.
- Recordes: melhor onda, vitórias e total de insetos derrotados.

![Fim de jogo](docs/v2_11_gameover.png)

### Personagens

| | Nome | Arma inicial | Estilo | Como liberar |
|---|---|---|---|---|
| 🥔 | Batata Básica | Soco | Equilibrada | — |
| 🍅 | Tomatão | Espada | Muita vida e dano corpo a corpo, mas lento | — |
| 🥕 | Cenoura Ninja | Faca | Rápida, esquiva e crítico | — |
| 🌽 | Milho Atirador | Pistola | Dano à distância e alcance | — |
| 🌶️ | Pimenta Ardida | Cajado de Fogo | Dano elemental (queimadura) | — |
| 🍆 | Berinjela Sortuda | Estilingue | Sorte e colheita, menos dano | — |
| 🎃 | Abóbora Blindada | Martelo | Armadura e vida, bem lenta | Chegar na onda 10 |
| 🥒 | Pepino Arqueiro | Arco | Crítico e alcance, pouca vida | Derrotar 2000 insetos |
| 🍄 | Cogumelo Místico | Varinha de Gelo | Elemental, regeneração e sorte | Vencer 1 partida |

### Conteúdo

- **14 armas**, **38 itens** (6 com efeito especial), **15 atributos**.
- **6 inimigos** (lagarta, vespa, aranha que cospe, joaninha blindada, escorpião que dá investida,
  mariposa), versões **elite** e **2 chefões** (Lesma Rainha e Formiga Imperatriz).
- Sons e música gerados por código, vibração, recordes e partida salvos no celular.

## 🛠️ Como o projeto funciona (para a apresentação)

Tudo foi feito em **Java puro**, sem motor de jogo e sem bibliotecas: o desenho usa o
`Canvas` do próprio Android, e os gráficos são **emojis** + formas geométricas.

```
app/src/main/
├── AndroidManifest.xml
├── res/                         ícone (vetor) e nome do app
└── java/com/escola/hortahostil/
    ├── MainActivity.java        abre o jogo em tela cheia
    ├── GameView.java            laço do jogo (60 atualizações/s) e toques na tela
    ├── Ui.java                  desenha todas as telas e trata os botões
    ├── Sprites.java             transforma emojis em imagens
    ├── Sfx.java                 sintetiza os efeitos sonoros (sem arquivos de áudio!)
    ├── Prefs.java               salva configurações e recordes
    └── game/                    LÓGICA DO JOGO (não depende do Android)
        ├── Game.java            ondas, inimigos, tiros, colisões, loja, level up
        ├── Player.java          jogador e atributos
        ├── WeaponDef/Weapon     armas
        ├── ItemDef.java         itens
        ├── EnemyDef/Enemy       inimigos e chefões
        └── ...
sim/SimTest.java                 "robô" que joga sozinho para testar e balancear
```

Conceitos usados: laço de jogo com passo fixo, máquina de estados (menu → jogo → level up → loja),
colisão entre círculos, vetores para movimento e mira, probabilidade (raridade dos itens, crítico, esquiva)
e herança/interfaces em Java.

### Compilar o APK você mesmo

Não precisa de Android Studio. Com Java 17+, `curl`, `zip` e `npm` instalados (Linux):

```bash
./build.sh          # gera HortaHostil.apk
./build.sh sim 20   # o robô joga 20 partidas e mostra o resultado
```

O script baixa as ferramentas do Android que faltam (aapt2, d8, android.jar) para a pasta `.tools/`.
A chave em `keystore/horta.p12` (senha `android`) assina o APK; mantenha a mesma chave para que
versões novas instalem por cima da antiga.
