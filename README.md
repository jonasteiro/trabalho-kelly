# Auditsystem — Automação de Auditoria de Qualidade

Este repositório contém a implementação do **Auditsystem**, uma ferramenta desenvolvida para automatizar processos de auditoria de qualidade, gestão de Não Conformidades (NC) e comunicação de escalonamento.

O projeto foi construído para ser leve, rápido e não depender de infraestrutura complexa, rodando inteiramente no lado do cliente (Client-side) e utilizando o `localStorage` do navegador para persistência de dados.

## 🎯 Objetivo do Projeto
Atender aos requisitos da disciplina de Qualidade de Software, demonstrando um fluxo completo de auditoria automatizada:
1. Aplicação de um checklist fixo (hardcoded) para um artefato específico.
2. Cálculo automático da porcentagem (%) de aderência.
3. Abertura, registro e acompanhamento do ciclo de vida de Não Conformidades (NCs).
4. Simulação de comunicação entre a equipe de qualidade e os responsáveis.
5. Processo de escalonamento automático de NCs baseado em violação de prazos.

## 🛠️ Tecnologias Utilizadas
A decisão arquitetural foi manter a stack simples para focar na lógica do processo de qualidade exigido na entrega:
* **HTML5:** Estrutura e semântica.
* **CSS3:** Estilização com variáveis nativas e design responsivo (sem frameworks pesados).
* **JavaScript (Vanilla):** Lógica de negócios, manipulação do DOM e regras de escalonamento.
* **Web Storage API (`localStorage`):** Persistência de dados (Auditorias, NCs, Histórico de Comunicação) sem necessidade de servidor de banco de dados externo.

## 🚀 Como Executar

A arquitetura não requer configuração de ambiente, servidores locais (como Apache ou Node) ou instalação de pacotes.

1. Faça o clone deste repositório:
   ```bash
   git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)
