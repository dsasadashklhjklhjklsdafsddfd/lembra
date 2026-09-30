# Lembra

Lembretes, notas e quadros num lugar só. É tipo Google Keep + Trello, com alertas que **realmente aparecem na tela**.

## Rodar

No Windows: dois cliques em **Abrir Lembra.bat**. Ou pelo terminal:

```bash
python serve.py
```

Abre em http://localhost:5173. Não precisa instalar nada. Precisa ser `localhost` (ou https): se você abrir o `index.html` direto pelo explorador de arquivos, as notificações do sistema não funcionam.

## O que tem

- **Quadro:** listas estilo Trello. Dá para arrastar cartões, criar, renomear e excluir listas, e adicionar cartões rapidamente.
- **Notas:** grade estilo Keep, com fixadas, cores, checklist e etiquetas (clique numa `#etiqueta` para filtrar).
- **Próximos:** agenda dos lembretes em Atrasados / Hoje / Amanhã / 7 dias, com botões para adiar.
- **Busca:** atalho `/`. **Novo:** atalho `N`. No editor, `Ctrl+Enter` salva.
- **Repetição:** todo dia, dias úteis, toda semana ou todo mês.
- **Backup:** exportar e importar em JSON, no sino → Notificações.

## Alertas

Cada lembrete tem um tipo, e cada tipo tem visual e som diferentes:

| Tipo | Na tela | Som | Notificação do sistema |
|---|---|---|---|
| 🚨 **Alarme** | Tela cheia vermelha pulsando, título gigante, relógio ao vivo | Sirene em loop até você agir (máx. 10 min) | Fica fixa até você clicar |
| 🔔 **Importante** | Janela grande no centro, borda âmbar pulsando | Carrilhão repetindo | Fica fixa até você clicar |
| 💬 **Suave** | Aviso grande no canto, some em 45 s | Sino leve, uma vez | Normal |

Todos também fazem o título da aba piscar, vibram no celular e têm os botões **Concluir / Adiar 5·10·30·60 min / Dispensar**. Esses botões também aparecem na notificação do Windows.

Para funcionar bem:
1. Clique no sino → **Permitir notificações**.
2. No Windows, desligue o **Não incomodar** e deixe o navegador liberado em Configurações → Sistema → Notificações.
3. Instale como app (ícone de instalar na barra de endereço) para ter janela própria.

> **Limite atual:** sem servidor, os alertas só disparam com o Lembra aberto (pode ser minimizado ou em outra aba). Se o navegador estiver fechado, os atrasados aparecem quando você abrir de novo. Com o Supabase dá para mandar **Web Push** e alertar mesmo com o navegador fechado.

## Estrutura

```
index.html            marcação e diálogos
css/styles.css        todo o visual
js/store.js           dados (localStorage hoje, Supabase depois; a API não muda)
js/alerts.js          alertas: overlay, som (Web Audio), notificação do sistema
js/app.js             UI, arrastar e soltar, editor, agendador
sw.js                 service worker (offline + botões da notificação)
serve.py              servidor local
```

## Próximos passos

- [ ] Supabase: auth, tabelas `columns`/`items` e sync em tempo real (trocar `store.js`)
- [ ] Web Push via Edge Function agendada, para alertar com o navegador fechado
