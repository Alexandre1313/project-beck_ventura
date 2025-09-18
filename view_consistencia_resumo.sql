-- =============================================
-- VIEW RESUMO RÁPIDO DE CONSISTÊNCIA
-- Para consultas mais ágeis e dashboards
-- =============================================

CREATE OR REPLACE VIEW vw_consistencia_resumo AS
SELECT 
    grade_id,
    "status",
    "numeroEscola",
    escola_nome,
    grade_atualizada_em,
    status_geral,
    
    -- TOTAIS PRINCIPAIS
    grade_items_total,
    caixas_qty_total, 
    caixa_items_total,
    total_saidas_reais,
    
    -- RESUMO DAS DIFERENÇAS
    diff_grade_caixas,
    diff_caixas_items, 
    diff_saidas_expedido,
    
    -- CHECKS RÁPIDOS
    check_grade_vs_caixas,
    check_caixas_vs_items,
    check_saidas_vs_expedido,
    
    -- INDICADOR VISUAL
    CASE 
        WHEN status_geral = '🎉 TUDO CONSISTENTE' THEN '🟢'
        ELSE '🔴'
    END as indicador

FROM vw_consistencia_grades_detalhada
ORDER BY grade_atualizada_em DESC;

-- =============================================
-- VIEW PARA ALERTAS CRÍTICOS
-- =============================================

CREATE OR REPLACE VIEW vw_alertas_criticos AS
SELECT 
    grade_id,
    "numeroEscola",
    escola_nome,
    "status",
    grade_atualizada_em,
    
    -- TIPOS DE PROBLEMAS
    CASE 
        WHEN ABS(diff_grade_caixas) > 0 THEN 'PROBLEMA: GradeItems vs Caixas'
        WHEN ABS(diff_caixas_items) > 0 THEN 'PROBLEMA: Caixas vs Items'  
        WHEN ABS(diff_saidas_expedido) > 0 THEN 'PROBLEMA: Saídas vs Expedido'
        ELSE 'OK'
    END as tipo_problema,
    
    -- MAGNITUDE DO PROBLEMA
    GREATEST(ABS(diff_grade_caixas), ABS(diff_caixas_items), ABS(diff_saidas_expedido)) as magnitude_erro,
    
    -- DADOS PARA INVESTIGAÇÃO
    grade_items_total,
    caixas_qty_total,
    caixa_items_total, 
    total_saidas_reais,
    
    -- DIFERENÇAS
    diff_grade_caixas,
    diff_caixas_items,
    diff_saidas_expedido

FROM vw_consistencia_grades_detalhada
WHERE status_geral = '⚠️ INCONSISTÊNCIA DETECTADA'
ORDER BY magnitude_erro DESC, grade_atualizada_em DESC;

-- =============================================
-- VIEW PARA MONITORAMENTO DE KITS
-- =============================================

CREATE OR REPLACE VIEW vw_monitoramento_kits AS
SELECT 
    grade_id,
    "numeroEscola",
    escola_nome,
    "status",
    
    -- DADOS DOS KITS
    grade_items_kit,
    kits_diferentes_count,
    kit_componentes_esperados_total,
    kit_componentes_expedidos_esperados,
    saidas_componentes_kit_total,
    
    -- VERIFICAÇÃO DE KITS
    CASE 
        WHEN kit_componentes_expedidos_esperados = saidas_componentes_kit_total 
        THEN '✅ Kits OK'
        ELSE '❌ Problema nos Kits'
    END as status_kits,
    
    -- DIFERENÇA NOS KITS
    (kit_componentes_expedidos_esperados - saidas_componentes_kit_total) as diff_kits

FROM vw_consistencia_grades_detalhada
WHERE grade_items_kit > 0  -- Apenas grades que têm kits
ORDER BY grade_atualizada_em DESC;
