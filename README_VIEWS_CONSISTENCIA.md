# 🔍 Sistema de Monitoramento de Consistência de Grades

## 📋 Visão Geral

Este sistema de VIEWs foi desenvolvido para monitorar a consistência das **últimas 10 grades** com status `EXPEDIDA` ou `DESPACHADA`, verificando se todos os dados estão corretos e consistentes entre si.

## 🎯 O que o Sistema Monitora

### ✅ Verificações Principais:
1. **GradeItems = QtyCaixas**: Se a quantidade planejada na grade bate com o planejado nas caixas
2. **QtyCaixas = CaixaItems**: Se o planejado nas caixas bate com o real nos itens das caixas  
3. **Saídas = Expedido**: Se as saídas reais (OutInput) batem com o que foi marcado como expedido

### 🔧 Tratamento Especial de Kits:
- **Kits não geram saída direta** - apenas seus componentes saem
- **Cálculo automático** de componentes esperados baseado na configuração do kit
- **Rastreamento de origem** via `kitOrigemId` e `kitOutput`

## 📁 Arquivos do Sistema

| Arquivo | Descrição |
|---------|-----------|
| `view_consistencia_grades.sql` | 🎯 VIEW principal ultra-detalhada |
| `view_consistencia_resumo.sql` | 🚀 VIEWs complementares (resumo, alertas, kits) |
| `executar_views_consistencia.sql` | 📜 Script para criar tudo + exemplos |
| `README_VIEWS_CONSISTENCIA.md` | 📖 Este arquivo de documentação |

## 🚀 Como Usar

### 1️⃣ Instalação
```sql
-- No pgAdmin, execute:
\i executar_views_consistencia.sql
```

### 2️⃣ Consultas Básicas

#### 📊 **Visão Completa** (todos os detalhes)
```sql
SELECT * FROM vw_consistencia_grades_detalhada;
```

#### 🚀 **Visão Resumida** (mais rápida)
```sql
SELECT * FROM vw_consistencia_resumo;
```

#### 🚨 **Apenas Problemas**
```sql
SELECT * FROM vw_consistencia_resumo 
WHERE indicador = '🔴';
```

#### ⚠️ **Alertas Críticos** (ordenados por gravidade)
```sql
SELECT * FROM vw_alertas_criticos;
```

#### 🔧 **Monitoramento de Kits**
```sql
SELECT * FROM vw_monitoramento_kits;
```

## 📊 Campos Principais

### 🎯 Identificação
- `grade_id`, `numeroEscola`, `escola_nome`
- `status`, `grade_atualizada_em`

### 📦 Quantidades
- `grade_items_total`: Total de itens na grade
- `caixas_qty_total`: Total planejado nas caixas
- `caixa_items_total`: Total real nos itens das caixas
- `total_saidas_reais`: Total de saídas (OutInput)

### ✅ Verificações
- `check_grade_vs_caixas`: ✅ OK ou ❌ ERRO
- `check_caixas_vs_items`: ✅ OK ou ❌ ERRO  
- `check_saidas_vs_expedido`: ✅ OK ou ❌ ERRO
- `status_geral`: 🎉 TUDO CONSISTENTE ou ⚠️ INCONSISTÊNCIA

### 🔍 Diferenças
- `diff_grade_caixas`: Diferença entre grade e caixas
- `diff_caixas_items`: Diferença entre caixas e items
- `diff_saidas_expedido`: Diferença entre saídas e expedido

## 🎨 Indicadores Visuais

| Símbolo | Significado |
|---------|-------------|
| 🟢 | Tudo OK |
| 🔴 | Problema detectado |
| ✅ | Verificação passou |
| ❌ | Verificação falhou |
| 🎉 | Tudo consistente |
| ⚠️ | Inconsistência detectada |

## 📈 Consultas Analíticas

### 📊 **Estatísticas Gerais**
```sql
SELECT 
    COUNT(*) as total_grades,
    SUM(CASE WHEN status_geral = '🎉 TUDO CONSISTENTE' THEN 1 ELSE 0 END) as grades_ok,
    SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) as grades_com_problema,
    ROUND((SUM(CASE WHEN status_geral = '🎉 TUDO CONSISTENTE' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as percentual_ok
FROM vw_consistencia_grades_detalhada;
```

### 🔍 **Análise por Tipo de Problema**
```sql
SELECT 
    tipo_problema,
    COUNT(*) as quantidade,
    AVG(magnitude_erro) as media_erro,
    MAX(magnitude_erro) as maior_erro
FROM vw_alertas_criticos
WHERE tipo_problema != 'OK'
GROUP BY tipo_problema
ORDER BY quantidade DESC;
```

### 🏫 **Problemas por Escola**
```sql
SELECT 
    numeroEscola,
    escola_nome,
    COUNT(*) as grades_processadas,
    SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) as grades_com_problema
FROM vw_consistencia_grades_detalhada
GROUP BY numeroEscola, escola_nome
HAVING SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) > 0
ORDER BY grades_com_problema DESC;
```

## 🔧 Lógica dos Kits

### Como Funciona:
1. **Kit na Grade**: Um kit aparece como item normal no GradeItem
2. **Componentes**: Cada kit tem N componentes definidos em KitItem
3. **Saída**: Quando kit é "usado", apenas os componentes saem via OutInput
4. **Rastreamento**: `kitOrigemId` aponta para o kit, `kitOutput = true`

### Cálculo:
```
Componentes Esperados = Kit_Quantidade × Componentes_Por_Kit
Saídas de Componentes = SUM(OutInput onde kitOrigemId = kit_id)
```

## 🚨 Tipos de Problemas Detectados

1. **GradeItems ≠ QtyCaixas**: Grade planejada diferente do planejado nas caixas
2. **QtyCaixas ≠ CaixaItems**: Planejado nas caixas diferente do real nos itens
3. **Saídas ≠ Expedido**: Saídas reais diferentes do marcado como expedido
4. **Problemas de Kits**: Componentes esperados ≠ componentes que saíram

## ⚡ Performance

- **Otimizada** para as últimas 10 grades apenas
- **CTEs** para organização e performance
- **Índices recomendados**: 
  - `Grade(status, updatedAt)`
  - `OutInput(gradeId, kitOrigemId)`
  - `ItemTamanho(isKit)`

## 🔄 Atualização Automática

As VIEWs se atualizam automaticamente conforme os dados mudam. Para monitoramento contínuo, execute periodicamente:

```sql
SELECT * FROM vw_consistencia_resumo WHERE indicador = '🔴';
```

## 🆘 Troubleshooting

### Problema: View não encontrada
```sql
-- Verifique se foi criada:
SELECT viewname FROM pg_views WHERE viewname LIKE 'vw_consistencia%';
```

### Problema: Dados inconsistentes
1. Execute `vw_alertas_criticos` para identificar o tipo
2. Verifique os campos `diff_*` para entender a magnitude
3. Use a view detalhada para análise profunda

---

## 🎉 Resultado Final

Com este sistema você terá:
- ✅ **Monitoramento automático** das últimas 10 grades
- ✅ **Detecção precisa** de inconsistências  
- ✅ **Tratamento completo** de kits
- ✅ **Relatórios detalhados** para investigação
- ✅ **Dashboard** para acompanhamento contínuo

**Agora você pode acompanhar se tudo caminha certo! 🚀**
