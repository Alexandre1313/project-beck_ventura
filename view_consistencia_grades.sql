-- =============================================
-- VIEW ULTRA ROBUSTA PARA CONSISTÊNCIA DE GRADES
-- Monitora as últimas 10 grades EXPEDIDAS/DESPACHADAS
-- Considera kits, saídas, caixas e todos os aspectos
-- =============================================

CREATE OR REPLACE VIEW vw_consistencia_grades_detalhada AS
WITH 
-- 1. Últimas 10 grades com status EXPEDIDA ou DESPACHADA
ultimas_grades AS (
    SELECT 
        g.id as grade_id,
        g.status,
        g."createdAt" as grade_criada_em,
        g."updatedAt" as grade_atualizada_em,
        g.finalizada,
        g.remessa,
        e."numeroEscola",
        e."nome" as escola_nome,
        c."nome" as company_nome,
        p."nome" as projeto_nome
    FROM "Grade" g
    INNER JOIN "Escola" e ON g."escolaId" = e.id
    INNER JOIN "Company" c ON g."companyId" = c.id
    INNER JOIN "Projeto" p ON e."projetoId" = p.id
    WHERE g.status IN ('EXPEDIDA', 'DESPACHADA')
    ORDER BY g."updatedAt" DESC
    LIMIT 10
),

-- 2. Soma total de GradeItems (considerando apenas itens que não são kits)
grade_items_totais AS (
    SELECT 
        gi."gradeId",
        SUM(CASE WHEN it."isKit" = false THEN gi."quantidade" ELSE 0 END) as total_grade_items_nao_kit,
        SUM(CASE WHEN it."isKit" = true THEN gi."quantidade" ELSE 0 END) as total_grade_items_kit,
        SUM(gi."quantidade") as total_grade_items_geral,
        SUM(CASE WHEN it."isKit" = false THEN gi."quantidadeExpedida" ELSE 0 END) as total_expedido_nao_kit,
        SUM(CASE WHEN it."isKit" = true THEN gi."quantidadeExpedida" ELSE 0 END) as total_expedido_kit,
        SUM(gi."quantidadeExpedida") as total_expedido_geral,
        COUNT(*) as total_itens_diferentes
    FROM "GradeItem" gi
    INNER JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
    WHERE gi."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    GROUP BY gi."gradeId"
),

-- 3. Soma total de qtyCaixa por grade
caixas_totais AS (
    SELECT 
        cx."gradeId",
        SUM(cx."qtyCaixa") as total_qty_caixas,
        COUNT(*) as total_caixas
    FROM "Caixa" cx
    WHERE cx."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    GROUP BY cx."gradeId"
),

-- 4. Soma total de CaixaItems por grade
caixa_items_totais AS (
    SELECT 
        cx."gradeId",
        SUM(ci."itemQty") as total_caixa_items,
        COUNT(*) as total_caixa_items_diferentes
    FROM "CaixaItem" ci
    INNER JOIN "Caixa" cx ON ci."caixaId" = cx.id
    WHERE cx."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    GROUP BY cx."gradeId"
),

-- 5. Saídas diretas (OutInput) por grade - apenas itens não-kit
saidas_diretas AS (
    SELECT 
        oi."gradeId",
        SUM(CASE WHEN it."isKit" = false AND oi."kitOutput" = false THEN oi."quantidade" ELSE 0 END) as total_saidas_diretas,
        COUNT(CASE WHEN it."isKit" = false AND oi."kitOutput" = false THEN 1 END) as total_saidas_diretas_count
    FROM "OutInput" oi
    INNER JOIN "ItemTamanho" it ON oi."itemTamanhoId" = it.id
    WHERE oi."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    GROUP BY oi."gradeId"
),

-- 6. Saídas de componentes de kits (quando um kit é "consumido", seus componentes saem)
saidas_componentes_kit AS (
    SELECT 
        oi."gradeId",
        SUM(oi."quantidade") as total_saidas_componentes_kit,
        COUNT(*) as total_saidas_componentes_kit_count
    FROM "OutInput" oi
    INNER JOIN "ItemTamanho" it_kit ON oi."kitOrigemId" = it_kit.id
    WHERE oi."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    AND oi."kitOutput" = true
    AND it_kit."isKit" = true
    GROUP BY oi."gradeId"
),

-- 7. Análise detalhada de kits na grade
kits_na_grade AS (
    SELECT 
        gi."gradeId",
        gi."itemTamanhoId" as kit_item_tamanho_id,
        gi."quantidade" as kit_quantidade,
        gi."quantidadeExpedida" as kit_quantidade_expedida,
        i."nome" as kit_nome,
        t."nome" as kit_tamanho,
        -- Soma dos componentes esperados para este kit
        SUM(ki."quantidade" * gi."quantidade") as componentes_esperados_total,
        SUM(ki."quantidade" * gi."quantidadeExpedida") as componentes_esperados_expedidos
    FROM "GradeItem" gi
    INNER JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
    INNER JOIN "Item" i ON it."itemId" = i.id
    INNER JOIN "Tamanho" t ON it."tamanhoId" = t.id
    INNER JOIN "KitItem" ki ON it.id = ki."kitId"
    WHERE it."isKit" = true 
    AND gi."gradeId" IN (SELECT grade_id FROM ultimas_grades)
    GROUP BY gi."gradeId", gi."itemTamanhoId", gi."quantidade", gi."quantidadeExpedida", i."nome", t."nome"
),

-- 8. Resumo de kits por grade
kits_resumo AS (
    SELECT 
        "gradeId",
        SUM(componentes_esperados_total) as total_componentes_esperados,
        SUM(componentes_esperados_expedidos) as total_componentes_expedidos_esperados,
        COUNT(*) as total_kits_diferentes
    FROM kits_na_grade
    GROUP BY "gradeId"
)

-- QUERY PRINCIPAL - UNIÃO DE TODOS OS DADOS
SELECT 
    ug.grade_id,
    ug."status",
    ug."numeroEscola",
    ug.escola_nome,
    ug.company_nome,
    ug.projeto_nome,
    ug.grade_criada_em,
    ug.grade_atualizada_em,
    ug."finalizada",
    ug."remessa",
    
    -- DADOS DOS GRADE ITEMS
    COALESCE(git.total_grade_items_nao_kit, 0) as grade_items_nao_kit,
    COALESCE(git.total_grade_items_kit, 0) as grade_items_kit,
    COALESCE(git.total_grade_items_geral, 0) as grade_items_total,
    COALESCE(git.total_expedido_nao_kit, 0) as grade_expedido_nao_kit,
    COALESCE(git.total_expedido_kit, 0) as grade_expedido_kit,
    COALESCE(git.total_expedido_geral, 0) as grade_expedido_total,
    COALESCE(git.total_itens_diferentes, 0) as grade_itens_diferentes,
    
    -- DADOS DAS CAIXAS
    COALESCE(ct.total_qty_caixas, 0) as caixas_qty_total,
    COALESCE(ct.total_caixas, 0) as caixas_count,
    COALESCE(cit.total_caixa_items, 0) as caixa_items_total,
    COALESCE(cit.total_caixa_items_diferentes, 0) as caixa_items_diferentes,
    
    -- DADOS DAS SAÍDAS
    COALESCE(sd.total_saidas_diretas, 0) as saidas_diretas_total,
    COALESCE(sd.total_saidas_diretas_count, 0) as saidas_diretas_count,
    COALESCE(sck.total_saidas_componentes_kit, 0) as saidas_componentes_kit_total,
    COALESCE(sck.total_saidas_componentes_kit_count, 0) as saidas_componentes_kit_count,
    
    -- DADOS DOS KITS
    COALESCE(kr.total_componentes_esperados, 0) as kit_componentes_esperados_total,
    COALESCE(kr.total_componentes_expedidos_esperados, 0) as kit_componentes_expedidos_esperados,
    COALESCE(kr.total_kits_diferentes, 0) as kits_diferentes_count,
    
    -- CÁLCULOS DE CONSISTÊNCIA
    -- Total de saídas reais (diretas + componentes de kit)
    (COALESCE(sd.total_saidas_diretas, 0) + COALESCE(sck.total_saidas_componentes_kit, 0)) as total_saidas_reais,
    
    -- Total esperado (itens não-kit + componentes esperados dos kits)
    (COALESCE(git.total_grade_items_nao_kit, 0) + COALESCE(kr.total_componentes_esperados, 0)) as total_esperado_final,
    
    -- Total expedido esperado
    (COALESCE(git.total_expedido_nao_kit, 0) + COALESCE(kr.total_componentes_expedidos_esperados, 0)) as total_expedido_esperado_final,
    
    -- VERIFICAÇÕES DE CONSISTÊNCIA
    CASE 
        WHEN COALESCE(git.total_grade_items_geral, 0) = COALESCE(ct.total_qty_caixas, 0) 
        THEN '✅ OK' 
        ELSE '❌ ERRO: GradeItems ≠ QtyCaixas' 
    END as check_grade_vs_caixas,
    
    CASE 
        WHEN COALESCE(ct.total_qty_caixas, 0) = COALESCE(cit.total_caixa_items, 0) 
        THEN '✅ OK' 
        ELSE '❌ ERRO: QtyCaixas ≠ CaixaItems' 
    END as check_caixas_vs_items,
    
    CASE 
        WHEN (COALESCE(sd.total_saidas_diretas, 0) + COALESCE(sck.total_saidas_componentes_kit, 0)) = 
             (COALESCE(git.total_expedido_nao_kit, 0) + COALESCE(kr.total_componentes_expedidos_esperados, 0))
        THEN '✅ OK' 
        ELSE '❌ ERRO: Saídas ≠ Expedido Esperado' 
    END as check_saidas_vs_expedido,
    
    -- DIFERENÇAS PARA ANÁLISE
    (COALESCE(git.total_grade_items_geral, 0) - COALESCE(ct.total_qty_caixas, 0)) as diff_grade_caixas,
    (COALESCE(ct.total_qty_caixas, 0) - COALESCE(cit.total_caixa_items, 0)) as diff_caixas_items,
    ((COALESCE(sd.total_saidas_diretas, 0) + COALESCE(sck.total_saidas_componentes_kit, 0)) - 
     (COALESCE(git.total_expedido_nao_kit, 0) + COALESCE(kr.total_componentes_expedidos_esperados, 0))) as diff_saidas_expedido,
    
    -- STATUS GERAL
    CASE 
        WHEN (COALESCE(git.total_grade_items_geral, 0) = COALESCE(ct.total_qty_caixas, 0)) AND
             (COALESCE(ct.total_qty_caixas, 0) = COALESCE(cit.total_caixa_items, 0)) AND
             ((COALESCE(sd.total_saidas_diretas, 0) + COALESCE(sck.total_saidas_componentes_kit, 0)) = 
              (COALESCE(git.total_expedido_nao_kit, 0) + COALESCE(kr.total_componentes_expedidos_esperados, 0)))
        THEN '🎉 TUDO CONSISTENTE'
        ELSE '⚠️ INCONSISTÊNCIA DETECTADA'
    END as status_geral

FROM ultimas_grades ug
LEFT JOIN grade_items_totais git ON ug.grade_id = git."gradeId"
LEFT JOIN caixas_totais ct ON ug.grade_id = ct."gradeId"
LEFT JOIN caixa_items_totais cit ON ug.grade_id = cit."gradeId"
LEFT JOIN saidas_diretas sd ON ug.grade_id = sd."gradeId"
LEFT JOIN saidas_componentes_kit sck ON ug.grade_id = sck."gradeId"
LEFT JOIN kits_resumo kr ON ug.grade_id = kr."gradeId"

ORDER BY ug.grade_atualizada_em DESC;

-- =============================================
-- COMENTÁRIOS E EXPLICAÇÕES
-- =============================================

/*
ESTA VIEW ANALISA:

1. 📊 GRADE ITEMS:
   - Separa itens normais de kits
   - Conta quantidades e expedições

2. 📦 CAIXAS:
   - Soma qtyCaixa (quantidade planejada por caixa)
   - Conta total de caixas

3. 📋 CAIXA ITEMS:
   - Soma itemQty (quantidade real nos itens das caixas)

4. 🚚 SAÍDAS (OutInput):
   - Saídas diretas (itens normais)
   - Saídas de componentes quando kits são "consumidos"

5. 🔧 KITS:
   - Calcula componentes esperados baseado nos kits da grade
   - Considera multiplicação: kit_qty × componentes_por_kit

VERIFICAÇÕES DE CONSISTÊNCIA:
✅ GradeItems = QtyCaixas
✅ QtyCaixas = CaixaItems  
✅ Saídas Reais = Expedido Esperado

LÓGICA DOS KITS:
- Kit não gera saída direta
- Quando kit é "usado", seus componentes saem via OutInput
- kitOrigemId aponta para o kit que originou a saída
- kitOutput = true indica saída de componente de kit

USO:
SELECT * FROM vw_consistencia_grades_detalhada;

Para ver apenas inconsistências:
SELECT * FROM vw_consistencia_grades_detalhada 
WHERE status_geral = '⚠️ INCONSISTÊNCIA DETECTADA';
*/
