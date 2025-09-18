-- =============================================
-- SCRIPT PARA EXECUTAR TODAS AS VIEWS DE CONSISTÊNCIA
-- Execute este arquivo no pgAdmin para criar todas as views
-- 
-- ⚠️  IMPORTANTE: PostgreSQL é case-sensitive!
-- Todas as colunas camelCase usam aspas duplas: "numeroEscola", "createdAt", etc.
-- =============================================

-- 1. Criar a view principal detalhada
\i view_consistencia_grades.sql

-- 2. Criar as views complementares  
\i view_consistencia_resumo.sql

-- =============================================
-- EXEMPLOS DE USO
-- =============================================

-- 📊 CONSULTA COMPLETA - Todas as informações
SELECT * FROM vw_consistencia_grades_detalhada;

-- 🚀 CONSULTA RÁPIDA - Apenas o essencial
SELECT * FROM vw_consistencia_resumo;

-- 🚨 APENAS PROBLEMAS - Grades com inconsistências
SELECT * FROM vw_consistencia_resumo 
WHERE indicador = '🔴';

-- ⚠️ ALERTAS CRÍTICOS - Problemas ordenados por gravidade
SELECT * FROM vw_alertas_criticos;

-- 🔧 MONITORAMENTO DE KITS - Apenas grades com kits
SELECT * FROM vw_monitoramento_kits;

-- 📈 ESTATÍSTICAS GERAIS
SELECT 
    COUNT(*) as total_grades,
    SUM(CASE WHEN status_geral = '🎉 TUDO CONSISTENTE' THEN 1 ELSE 0 END) as grades_ok,
    SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) as grades_com_problema,
    ROUND(
        (SUM(CASE WHEN status_geral = '🎉 TUDO CONSISTENTE' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as percentual_ok
FROM vw_consistencia_grades_detalhada;

-- 🔍 ANÁLISE POR TIPO DE PROBLEMA
SELECT 
    tipo_problema,
    COUNT(*) as quantidade,
    AVG(magnitude_erro) as media_erro,
    MAX(magnitude_erro) as maior_erro
FROM vw_alertas_criticos
WHERE tipo_problema != 'OK'
GROUP BY tipo_problema
ORDER BY quantidade DESC;

-- 📅 EVOLUÇÃO TEMPORAL (últimos problemas por data)
SELECT 
    DATE(grade_atualizada_em) as data,
    COUNT(*) as grades_processadas,
    SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) as problemas
FROM vw_consistencia_grades_detalhada
GROUP BY DATE(grade_atualizada_em)
ORDER BY data DESC;

-- 🏫 PROBLEMAS POR ESCOLA
SELECT 
    "numeroEscola",
    escola_nome,
    COUNT(*) as grades_processadas,
    SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) as grades_com_problema
FROM vw_consistencia_grades_detalhada
GROUP BY "numeroEscola", escola_nome
HAVING SUM(CASE WHEN status_geral = '⚠️ INCONSISTÊNCIA DETECTADA' THEN 1 ELSE 0 END) > 0
ORDER BY grades_com_problema DESC;
