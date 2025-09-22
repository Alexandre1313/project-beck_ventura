import { DataAgrupada, ExpedicaoResumoPDGrouped, ExpedicaoResumoPDItem, FinalyGrade, Grade } from '@core/index';
import { Injectable } from '@nestjs/common';
import { GradeItem, Prisma, Status } from '@prisma/client';
import { PrismaProvider } from 'src/db/prisma.provider';
import { sizes } from '@core/utils/utils';
import { gerarPDFExpedicao, gerarPDFExpedicaoComEscola } from '@core/utils/create_pdfs/pdfMakeGenertor';

@Injectable()
export class GradePrisma {
  constructor(readonly prisma: PrismaProvider) { }

  async salvar(grade: Grade): Promise<Grade> {
    const { id, finalizada, itensGrade, escola, company, gradeCaixas, ...dadosDaGrade } = grade;

    const gradeSalva = await this.prisma.grade.upsert({
      where: {
        id: id !== undefined ? +id : -1,
      },
      update: {
        ...dadosDaGrade,
        // Aqui você pode adicionar lógica específica para atualizar grades se necessário
      },
      create: {
        ...dadosDaGrade,
        // Aqui você pode adicionar lógica específica para criar grades se necessário
      },
    });
    return gradeSalva; // Retorne o grade salva
  }

  async finalizarGrade(finalyGrade: FinalyGrade): Promise<Grade> {
    const { id, finalizada, status } = finalyGrade;
    return await this.prisma.$transaction(async (prisma) => {
      try {
        const gradeAtualizada = await prisma.grade.update({
          where: { id },
          data: { finalizada: finalizada, status: status },
        });
        return gradeAtualizada;
      } catch (error) {
        throw new Error(`Erro ao atualizar a grade: ${error.message}`);
      }
    });
  }

  async obter(): Promise<Grade[]> {
    const grades = await this.prisma.grade.findMany();
    return grades;
  }

  async obterPorId(id: number): Promise<Grade | null> {
    const grade = await this.prisma.grade.findUnique({ where: { id }, include: { itensGrade: true } });
    return (grade as Grade) ?? null;
  }

  async excluir(id: number): Promise<void> {
    try {
      // Tente excluir a grade com o ID fornecido
      await this.prisma.grade.delete({ where: { id } });
    } catch (error) {
      // Aqui você pode capturar e tratar o erro
      console.error('Erro ao excluir a grade:', error);

      // Lançar um erro apropriado ou lançar uma exceção
      if (error.code === 'P2025') {
        // Erro específico quando o registro não é encontrado
        throw new Error('A grade não foi encontrada.');
      } else {
        // Lidar com outros erros genéricos
        throw new Error('Erro ao tentar excluir a grade. Por favor, tente novamente.');
      }
    }
  }

  async replicarGrade(id: number): Promise<Grade | null> {
    try {
      return await this.prisma.$transaction(
        async (prisma) => {
          const grade = await prisma.grade.findUnique({
            where: { id },
            include: { itensGrade: true },
          });

          if (!grade || grade.status !== "PENDENTE") {
            return null;
          }

          let itemsParaCriarNovaGrade: GradeItem[] = [];
          let houveAjuste = false;

          // Verifica se existe algum item com quantidadeExpedida > 0
          const algumItemExpedido = grade.itensGrade.some(
            (item) => item.quantidadeExpedida > 0
          );

          if (!algumItemExpedido) {
            return null;
          }

          // Ajuste e coleta de itens para a nova grade
          for (const item of grade.itensGrade) {
            const quantidadeRestante = item.quantidade - item.quantidadeExpedida;

            if (quantidadeRestante > 0 && algumItemExpedido) {
              // Adiciona o item na nova grade com a quantidade restante
              itemsParaCriarNovaGrade.push({
                ...item,
                quantidade: quantidadeRestante,
                quantidadeExpedida: 0, // Início sem nada expedido
              });

              // Atualiza o item original para igualar quantidade e quantidadeExpedida
              await prisma.gradeItem.update({
                where: { id: item.id },
                data: { quantidade: item.quantidadeExpedida },
              });

              houveAjuste = true;
            }

            if (algumItemExpedido && item.quantidadeExpedida === 0) {
              // Exclui o item se quantidadeExpedida for igual a 0 e algum item já foi expedido
              await prisma.gradeItem.delete({
                where: { id: item.id },
              });
            }
          }

          // Finaliza a grade original apenas se houve ajuste
          if (houveAjuste) {
            await prisma.grade.update({
              where: { id: grade.id },
              data: {
                finalizada: true,
                status: 'EXPEDIDA' as Status,
              },
            });
          }

          // Criação de nova grade, se necessário
          if (itemsParaCriarNovaGrade.length > 0 && houveAjuste) {
            const novaGrade: Grade = {
              companyId: grade.companyId,
              escolaId: grade.escolaId,
              finalizada: false,
              tipo: grade.tipo?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() === 'REPOSICAO' ? 'REPOSIÇÃO' : null,
              status: 'PENDENTE' as Status,
              remessa: grade.remessa,
              itensGrade: itemsParaCriarNovaGrade,
            };

            const { itensGrade, ...dadosDaGrade } = novaGrade;

            // Cria a nova grade
            const gradeReplicada = await prisma.grade.create({
              data: {
                escolaId: dadosDaGrade.escolaId,
                companyId: dadosDaGrade.companyId,
                finalizada: dadosDaGrade.finalizada,
                tipo: dadosDaGrade.tipo,
                remessa: dadosDaGrade.remessa,
                status: dadosDaGrade.status as Status,
              },
            });

            // Adiciona os itens à nova grade
            if (itensGrade.length > 0) {
              await Promise.all(
                itensGrade.map(async (item) => {
                  await prisma.gradeItem.create({
                    data: {
                      gradeId: gradeReplicada.id,
                      itemTamanhoId: item.itemTamanhoId,
                      quantidade: item.quantidade,
                      quantidadeExpedida: item.quantidadeExpedida,
                    },
                  });
                })
              );
            }

            // Retorna a nova grade com os itens criados
            const novaGradeComItens = await prisma.grade.findUnique({
              where: { id: gradeReplicada.id },
              include: {
                itensGrade: true,
              },
            });

            return novaGradeComItens as Grade;
          }

          // Caso não haja itens para replicar, retorna null
          return null;
        },
        {
          maxWait: 10000, // Tempo máximo para aguardar o início da transação
          timeout: 20000, // Tempo máximo para execução da transação
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error: any) {
      console.error("", error);
      throw new Error("Erro ao replicar grade: " + error.message);
    }
  }

  async atualizarStatusParaDespachada(gradeIds: number[]): Promise<number[]> {
    // Busca as grades no banco de dados, garantindo que estejam com status "EXPEDIDA"
    const gradesExpedidas = await this.prisma.grade.findMany({
      where: {
        id: { in: gradeIds },
        status: "EXPEDIDA",
      },
      select: { id: true },
    });

    // Se não encontrar nenhuma grade expedida, retorna um array vazio
    if (gradesExpedidas.length === 0) return [];

    // Extrai os IDs das grades que serão alteradas
    const idsParaAtualizar = gradesExpedidas.map(grade => grade.id);

    // Atualiza o status das grades encontradas para "DESPACHADA"
    await this.prisma.grade.updateMany({
      where: { id: { in: idsParaAtualizar } },
      data: { status: "DESPACHADA" },
    });

    // Retorna os IDs das grades que foram alteradas
    return idsParaAtualizar;
  }

  async getResumoExpedicaoPD(projetoId: number, tipoGrade: number, remessa: number): Promise<ExpedicaoResumoPDGrouped[]> {
    try {
      const projetoFilter = projetoId === -1 ? '' : `AND i."projetoId" = ${projetoId}`;
      const remessaFilter = remessa === -1 ? '' : `AND g."remessa" = ${remessa}`;

      let tipoGradeFilter = '';
      if (tipoGrade === 1) tipoGradeFilter = `AND g."tipo" IS NULL`;
      else if (tipoGrade === 2) tipoGradeFilter = `AND g."tipo" ILIKE '%REPOS%'`;

      // Mapeia tamanhos alfabéticos para prioridade, todos como TEXT
      const tamanhoPriority: Record<string, number> = {};
      sizes.forEach((t, idx) => (tamanhoPriority[t] = idx));

      const caseTamanhoOrdem = Object.entries(tamanhoPriority)
        .map(([t, idx]) => `WHEN tamanho = '${t}' THEN '${100 + idx}'`)
        .join('\n');

      const query = `
      WITH base AS (
        SELECT
          p.nome AS projectname,
          g.status AS status,
          g."updatedAt"::date AS data,
          i.nome AS item,
          i.genero::text AS genero,
          t.nome AS tamanho,
          SUM(gi.quantidade) AS previsto,
          SUM(gi."quantidadeExpedida") AS expedido
        FROM "GradeItem" gi
        JOIN "Grade" g ON gi."gradeId" = g.id
        JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
        JOIN "Item" i ON it."itemId" = i.id
        JOIN "Tamanho" t ON it."tamanhoId" = t.id
        JOIN "Projeto" p ON i."projetoId" = p.id
        WHERE 1=1
          ${projetoFilter}
          ${tipoGradeFilter}
          ${remessaFilter}
        GROUP BY p.nome, g.status, g."updatedAt", i.nome, i.genero, t.nome
      ),
      ordenado AS (
        SELECT *,
          CASE
            WHEN tamanho ~ '^[0-9]+$' THEN LPAD(tamanho, 2, '0') -- números como texto
            ${caseTamanhoOrdem}                                -- letras do array
            ELSE '999'
          END AS tamanho_ordem
        FROM base
      )
      SELECT
        projectname,
        status,
        data,
        item,
        genero,
        tamanho,
        previsto,
        expedido
      FROM ordenado
      ORDER BY
        projectname,
        CASE status
          WHEN 'DESPACHADA' THEN 2
          WHEN 'EXPEDIDA' THEN 1
          WHEN 'PENDENTE' THEN 3
          ELSE 99
        END,
        data DESC NULLS LAST,
        item,
        genero,
        tamanho_ordem;
    `;

      const rows: {
        projectname: string;
        status: string | null;
        data: Date | null;
        item: string;
        genero: string;
        tamanho: string;
        previsto: number;
        expedido: number;
      }[] = await this.prisma.$queryRawUnsafe(query);

      if (!rows || rows.length === 0) return [];

      // Agrupamento: projeto → status → data
      const grouped: Record<string, Record<string, Record<string, ExpedicaoResumoPDItem[]>>> = {};

      for (const row of rows) {
        const project = row.projectname;
        const status = (row.status || 'SEM STATUS').toUpperCase();
        const dataStr = row.data ? row.data.toISOString().split('T')[0] : 'null';
        grouped[project] ??= {};
        grouped[project][status] ??= {};
        grouped[project][status][dataStr] ??= [];

        grouped[project][status][dataStr].push({
          data: dataStr === 'null' ? null : dataStr,
          item: row.item,
          genero: row.genero,
          tamanho: row.tamanho,
          previsto: Number(row.previsto),
          expedido: Number(row.expedido),
        });
      }

      const statusOrder = ['EXPEDIDA', 'DESPACHADA', 'PENDENTE'];
      const resultado: ExpedicaoResumoPDGrouped[] = [];

      for (const [projectname, statuses] of Object.entries(grouped)) {
        let totalGeralPrevisto = 0;
        let totalGeralExpedido = 0;
        const groupedItems: DataAgrupada[] = [];

        const sortedStatuses = Object.keys(statuses).sort((a, b) => {
          const indexA = statusOrder.indexOf(a.toUpperCase());
          const indexB = statusOrder.indexOf(b.toUpperCase());
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        for (const status of sortedStatuses) {
          const statusUpper = status.toUpperCase();

          groupedItems.push({
            data: null,
            items: [{
              data: null,
              item: `STATUS: ${statusUpper}`,
              genero: '',
              tamanho: '',
              previsto: 0,
              expedido: 0,
            }],
          });

          const dateGroups = statuses[status];
          const sortedDates = Object.keys(dateGroups).sort((a, b) => {
            if (a === 'null') return 1;
            if (b === 'null') return -1;
            return new Date(b).getTime() - new Date(a).getTime(); // mais recente → mais antiga
          });

          for (const data of sortedDates) {
            const items = dateGroups[data];

            // Ordena dentro da data por item → genero → tamanho_ordem
            items.sort((x, y) => {
              if (x.item !== y.item) return x.item.localeCompare(y.item);
              if (x.genero !== y.genero) return x.genero.localeCompare(y.genero);

              // Usa ordem do CASE para tamanhos
              const ordX = tamanhoPriority[x.tamanho] ?? (x.tamanho.match(/^\d+$/) ? parseInt(x.tamanho) : 999);
              const ordY = tamanhoPriority[y.tamanho] ?? (y.tamanho.match(/^\d+$/) ? parseInt(y.tamanho) : 999);
              return ordX - ordY;
            });

            const subtotalPrevisto = items.reduce((sum, x) => sum + x.previsto, 0);
            const subtotalExpedido = items.reduce((sum, x) => sum + x.expedido, 0);
            totalGeralPrevisto += subtotalPrevisto;
            totalGeralExpedido += subtotalExpedido;

            groupedItems.push({
              data: data === 'null' ? null : data,
              items: [
                ...items,
                {
                  data: data === 'null' ? null : data,
                  item: 'Total',
                  genero: '',
                  tamanho: '',
                  previsto: subtotalPrevisto,
                  expedido: subtotalExpedido,
                },
              ],
            });
          }
        }

        groupedItems.push({
          data: null,
          items: [{
            data: null,
            item: 'Total Geral',
            genero: '',
            tamanho: '',
            previsto: totalGeralPrevisto,
            expedido: totalGeralExpedido,
          }],
        });

        resultado.push({ projectname, groupedItems });
      }

      return resultado;
    } catch (error) {
      console.error('Erro ao buscar resumo da expedição:', error);
      throw new Error('Erro ao buscar resumo da expedição');
    }
  }

  async getResumoExpedicaoPDResum(
    projetoId: number,
    tipoGrade: number,
    remessa: number
  ): Promise<ExpedicaoResumoPDGrouped[]> {
    try {
      const projetoFilter = projetoId === -1 ? '' : `AND i."projetoId" = ${projetoId}`;
      const remessaFilter = remessa === -1 ? '' : `AND g."remessa" = ${remessa}`;

      let tipoGradeFilter = '';
      if (tipoGrade === 1) tipoGradeFilter = `AND g."tipo" IS NULL`;
      else if (tipoGrade === 2) tipoGradeFilter = `AND g."tipo" ILIKE '%REPOS%'`;

      // Mapeia tamanhos alfabéticos para prioridade (tamanho do array + 100 para não conflitar com números)
      const tamanhoPriority: Record<string, number> = {};
      sizes.forEach((t, idx) => (tamanhoPriority[t] = idx));

      const caseTamanhoOrdem = Object.entries(tamanhoPriority)
        .map(([t, idx]) => `WHEN tamanho = '${t}' THEN '${100 + idx}'`)
        .join('\n');

      const query = `
      WITH base AS (
        SELECT
          p.nome AS projectname,
          g.status AS status,
          g."updatedAt"::date AS data,
          i.nome AS item,
          i.genero::text AS genero,
          t.nome AS tamanho,
          SUM(gi.quantidade) AS previsto,
          SUM(gi."quantidadeExpedida") AS expedido
        FROM "GradeItem" gi
        JOIN "Grade" g ON gi."gradeId" = g.id
        JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
        JOIN "Item" i ON it."itemId" = i.id
        JOIN "Tamanho" t ON it."tamanhoId" = t.id
        JOIN "Projeto" p ON i."projetoId" = p.id
        WHERE 1=1
          ${projetoFilter}
          ${tipoGradeFilter}
          ${remessaFilter}
        GROUP BY p.nome, g.status, g."updatedAt", i.nome, i.genero, t.nome
      ),
      ordenado AS (
        SELECT *,
          CASE
            WHEN tamanho ~ '^[0-9]+$' THEN LPAD(tamanho, 2, '0')  -- números do 00 ao 16
            ${caseTamanhoOrdem}                                 -- letras do array sizes
            ELSE '999'
          END AS tamanho_ordem
        FROM base
      )
      SELECT
        projectname,
        status,
        data,
        item,
        genero,
        tamanho,
        SUM(previsto) AS previsto,
        SUM(expedido) AS expedido
      FROM ordenado
      GROUP BY projectname, status, data, item, genero, tamanho, tamanho_ordem
      ORDER BY
        projectname,
        CASE status
          WHEN 'DESPACHADA' THEN 2
          WHEN 'EXPEDIDA' THEN 1
          WHEN 'PENDENTE' THEN 3
          ELSE 99
        END,
        data DESC NULLS LAST,
        item,
        genero,
        tamanho_ordem;
    `;

      const rows: {
        projectname: string;
        status: string | null;
        data: Date | null;
        item: string;
        genero: string;
        tamanho: string;
        previsto: number;
        expedido: number;
      }[] = await this.prisma.$queryRawUnsafe(query);

      if (!rows || rows.length === 0) return [];

      // Agrupamento: projeto → status → data
      const grouped: Record<string, Record<string, Record<string, Record<string, ExpedicaoResumoPDItem>>>> = {};

      for (const row of rows) {
        const project = row.projectname;
        const status = (row.status || 'SEM STATUS').toUpperCase();
        const dataStr = row.data ? row.data.toISOString().split('T')[0] : 'null';
        grouped[project] ??= {};
        grouped[project][status] ??= {};
        grouped[project][status][dataStr] ??= {};

        // Chave única por item + genero + tamanho
        const key = `${row.item}|${row.genero}|${row.tamanho}`;
        if (!grouped[project][status][dataStr][key]) {
          grouped[project][status][dataStr][key] = {
            data: dataStr === 'null' ? null : dataStr,
            item: row.item,
            genero: row.genero,
            tamanho: row.tamanho,
            previsto: Number(row.previsto),
            expedido: Number(row.expedido),
          };
        } else {
          grouped[project][status][dataStr][key].previsto += Number(row.previsto);
          grouped[project][status][dataStr][key].expedido += Number(row.expedido);
        }
      }

      const statusOrder = ['EXPEDIDA', 'DESPACHADA', 'PENDENTE'];
      const resultado: ExpedicaoResumoPDGrouped[] = [];

      for (const [projectname, statuses] of Object.entries(grouped)) {
        let totalGeralPrevisto = 0;
        let totalGeralExpedido = 0;
        const groupedItems: DataAgrupada[] = [];

        const sortedStatuses = Object.keys(statuses).sort((a, b) => {
          const indexA = statusOrder.indexOf(a.toUpperCase());
          const indexB = statusOrder.indexOf(b.toUpperCase());
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        for (const status of sortedStatuses) {
          const statusUpper = status.toUpperCase();

          groupedItems.push({
            data: null,
            items: [{
              data: null,
              item: `STATUS: ${statusUpper}`,
              genero: '',
              tamanho: '',
              previsto: 0,
              expedido: 0,
            }],
          });

          const dateGroups = statuses[status];
          const sortedDates = Object.keys(dateGroups).sort((a, b) => {
            if (a === 'null') return 1;
            if (b === 'null') return -1;
            return new Date(b).getTime() - new Date(a).getTime(); // mais recente → mais antiga
          });

          for (const data of sortedDates) {
            const itemsMap = dateGroups[data];
            const items = Object.values(itemsMap);

            // Ordena por item → genero → tamanho
            items.sort((x, y) => {
              if (x.item !== y.item) return x.item.localeCompare(y.item);
              if (x.genero !== y.genero) return x.genero.localeCompare(y.genero);

              const isNumX = x.tamanho.match(/^\d+$/);
              const isNumY = y.tamanho.match(/^\d+$/);

              const ordX = isNumX ? parseInt(x.tamanho) : 100 + (tamanhoPriority[x.tamanho] ?? 999);
              const ordY = isNumY ? parseInt(y.tamanho) : 100 + (tamanhoPriority[y.tamanho] ?? 999);

              return ordX - ordY;
            });

            const subtotalPrevisto = items.reduce((sum, x) => sum + x.previsto, 0);
            const subtotalExpedido = items.reduce((sum, x) => sum + x.expedido, 0);
            totalGeralPrevisto += subtotalPrevisto;
            totalGeralExpedido += subtotalExpedido;

            groupedItems.push({
              data: data === 'null' ? null : data,
              items: [
                ...items,
                {
                  data: data === 'null' ? null : data,
                  item: 'Total',
                  genero: '',
                  tamanho: '',
                  previsto: subtotalPrevisto,
                  expedido: subtotalExpedido,
                },
              ],
            });
          }
        }

        groupedItems.push({
          data: null,
          items: [{
            data: null,
            item: 'Total Geral',
            genero: '',
            tamanho: '',
            previsto: totalGeralPrevisto,
            expedido: totalGeralExpedido,
          }],
        });

        resultado.push({ projectname, groupedItems });
      }

      return resultado;
    } catch (error) {
      console.error('Erro ao buscar resumo da expedição:', error);
      throw new Error('Erro ao buscar resumo da expedição');
    }
  }

  async getResumoExpedicaoPDResumPDF(projetoId: number, tipoGrade: number, remessa: number): Promise<Buffer> {
    try {
      const projetoFilter = projetoId === -1 ? '' : `AND i."projetoId" = ${projetoId}`;
      const remessaFilter = remessa === -1 ? '' : `AND g."remessa" = ${remessa}`;

      let tipoGradeFilter = '';
      if (tipoGrade === 1) tipoGradeFilter = `AND g."tipo" IS NULL`;
      else if (tipoGrade === 2) tipoGradeFilter = `AND g."tipo" ILIKE '%REPOS%'`;

      // Mapeia tamanhos alfabéticos para prioridade (tamanho do array + 100 para não conflitar com números)
      const tamanhoPriority: Record<string, number> = {};
      sizes.forEach((t, idx) => (tamanhoPriority[t] = idx));

      const caseTamanhoOrdem = Object.entries(tamanhoPriority)
        .map(([t, idx]) => `WHEN tamanho = '${t}' THEN '${100 + idx}'`)
        .join('\n');

      const query = `
      WITH base AS (
        SELECT
          p.nome AS projectname,
          g.status AS status,
          g."updatedAt"::date AS data,
          i.nome AS item,
          i.genero::text AS genero,
          t.nome AS tamanho,
          SUM(gi.quantidade) AS previsto,
          SUM(gi."quantidadeExpedida") AS expedido
        FROM "GradeItem" gi
        JOIN "Grade" g ON gi."gradeId" = g.id
        JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
        JOIN "Item" i ON it."itemId" = i.id
        JOIN "Tamanho" t ON it."tamanhoId" = t.id
        JOIN "Projeto" p ON i."projetoId" = p.id
        WHERE 1=1
          ${projetoFilter}
          ${tipoGradeFilter}
          ${remessaFilter}
        GROUP BY p.nome, g.status, g."updatedAt", i.nome, i.genero, t.nome
      ),
      ordenado AS (
        SELECT *,
          CASE
            WHEN tamanho ~ '^[0-9]+$' THEN LPAD(tamanho, 2, '0')  -- números do 00 ao 16
            ${caseTamanhoOrdem}                                 -- letras do array sizes
            ELSE '999'
          END AS tamanho_ordem
        FROM base
      )
      SELECT
        projectname,
        status,
        data,
        item,
        genero,
        tamanho,
        SUM(previsto) AS previsto,
        SUM(expedido) AS expedido
      FROM ordenado
      GROUP BY projectname, status, data, item, genero, tamanho, tamanho_ordem
      ORDER BY
        projectname,
        CASE status
          WHEN 'PENDENTE' THEN 3
          WHEN 'EXPEDIDA' THEN 1
          WHEN 'DESPACHADA' THEN 2
          ELSE 99
        END,
        data DESC NULLS LAST,
        item,
        genero,
        tamanho_ordem;
    `;

      const rows: {
        projectname: string;
        status: string | null;
        data: Date | null;
        item: string;
        genero: string;
        tamanho: string;
        previsto: number;
        expedido: number;
      }[] = await this.prisma.$queryRawUnsafe(query);

      if (!rows || rows.length === 0) {
        // caso não tenha dados, pode retornar um PDF vazio ou um buffer vazio
        return gerarPDFExpedicao([]);
      }

      // Agrupamento: projeto → status → data
      const grouped: Record<string, Record<string, Record<string, Record<string, ExpedicaoResumoPDItem>>>> = {};

      for (const row of rows) {
        const project = row.projectname;
        const status = (row.status || 'SEM STATUS').toUpperCase();
        const dataStr = row.data ? row.data.toISOString().split('T')[0] : 'null';
        grouped[project] ??= {};
        grouped[project][status] ??= {};
        grouped[project][status][dataStr] ??= {};

        // Chave única por item + genero + tamanho
        const key = `${row.item}|${row.genero}|${row.tamanho}`;
        if (!grouped[project][status][dataStr][key]) {
          grouped[project][status][dataStr][key] = {
            data: dataStr === 'null' ? null : dataStr,
            item: row.item,
            genero: row.genero,
            tamanho: row.tamanho,
            previsto: Number(row.previsto),
            expedido: Number(row.expedido),
          };
        } else {
          grouped[project][status][dataStr][key].previsto += Number(row.previsto);
          grouped[project][status][dataStr][key].expedido += Number(row.expedido);
        }
      }

      const statusOrder = ['EXPEDIDA', 'DESPACHADA', 'PENDENTE'];
      const resultado: ExpedicaoResumoPDGrouped[] = [];

      for (const [projectname, statuses] of Object.entries(grouped)) {
        let totalGeralPrevisto = 0;
        let totalGeralExpedido = 0;
        const groupedItems: DataAgrupada[] = [];

        const sortedStatuses = Object.keys(statuses).sort((a, b) => {
          const indexA = statusOrder.indexOf(a.toUpperCase());
          const indexB = statusOrder.indexOf(b.toUpperCase());
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        for (const status of sortedStatuses) {
          const statusUpper = status.toUpperCase();

          groupedItems.push({
            data: null,
            items: [{
              data: null,
              item: `STATUS: ${statusUpper}`,
              genero: '',
              tamanho: '',
              previsto: 0,
              expedido: 0,
            }],
          });

          const dateGroups = statuses[status];
          const sortedDates = Object.keys(dateGroups).sort((a, b) => {
            if (a === 'null') return 1;
            if (b === 'null') return -1;
            return new Date(b).getTime() - new Date(a).getTime(); // mais recente → mais antiga
          });

          for (const data of sortedDates) {
            const itemsMap = dateGroups[data];
            const items = Object.values(itemsMap);

            // Ordena por item → genero → tamanho
            items.sort((x, y) => {
              if (x.item !== y.item) return x.item.localeCompare(y.item);
              if (x.genero !== y.genero) return x.genero.localeCompare(y.genero);

              const isNumX = x.tamanho.match(/^\d+$/);
              const isNumY = y.tamanho.match(/^\d+$/);

              const ordX = isNumX ? parseInt(x.tamanho) : 100 + (tamanhoPriority[x.tamanho] ?? 999);
              const ordY = isNumY ? parseInt(y.tamanho) : 100 + (tamanhoPriority[y.tamanho] ?? 999);

              return ordX - ordY;
            });

            const subtotalPrevisto = items.reduce((sum, x) => sum + x.previsto, 0);
            const subtotalExpedido = items.reduce((sum, x) => sum + x.expedido, 0);
            totalGeralPrevisto += subtotalPrevisto;
            totalGeralExpedido += subtotalExpedido;

            groupedItems.push({
              data: data === 'null' ? null : data,
              items: [
                ...items,
                {
                  data: data === 'null' ? null : data,
                  item: 'Total',
                  genero: '',
                  tamanho: '',
                  previsto: subtotalPrevisto,
                  expedido: subtotalExpedido,
                },
              ],
            });
          }
        }

        groupedItems.push({
          data: null,
          items: [{
            data: null,
            item: 'Total Geral',
            genero: '',
            tamanho: '',
            previsto: totalGeralPrevisto,
            expedido: totalGeralExpedido,
          }],
        });

        resultado.push({ projectname, groupedItems });
      }

      const pdfBuffer: Buffer = await gerarPDFExpedicao(resultado);

      return pdfBuffer;
    } catch (error) {
      console.error('Erro ao buscar resumo da expedição e gerar o pdf:', error);
      throw new Error('Erro ao buscar resumo da expedição e gerar o pdf');
    }
  }

  async getResumoExpedicaoPDComEscola(projetoId: number, tipoGrade: number, remessa: number): Promise<ExpedicaoResumoPDGrouped[]> {
    try {
      const projetoFilter = projetoId === -1 ? '' : `AND i."projetoId" = ${projetoId}`;
      const remessaFilter = remessa === -1 ? '' : `AND g."remessa" = ${remessa}`;

      let tipoGradeFilter = '';
      if (tipoGrade === 1) tipoGradeFilter = `AND g."tipo" IS NULL`;
      else if (tipoGrade === 2) tipoGradeFilter = `AND g."tipo" ILIKE '%REPOS%'`;

      // Mapeia tamanhos alfabéticos para prioridade, todos como TEXT
      const tamanhoPriority: Record<string, number> = {};
      sizes.forEach((t, idx) => (tamanhoPriority[t] = idx));

      const caseTamanhoOrdem = Object.entries(tamanhoPriority)
        .map(([t, idx]) => `WHEN tamanho = '${t}' THEN '${100 + idx}'`)
        .join('\n');

      const query = `
      WITH base AS (
        SELECT
          p.nome AS projectname,
          g.status AS status,
          g."updatedAt"::date AS data,
          e.nome AS escola_nome,
          e."numeroEscola" AS escola_numero,
          i.nome AS item,
          i.genero::text AS genero,
          t.nome AS tamanho,
          SUM(gi.quantidade) AS previsto,
          SUM(gi."quantidadeExpedida") AS expedido
        FROM "GradeItem" gi
        JOIN "Grade" g ON gi."gradeId" = g.id
        JOIN "Escola" e ON g."escolaId" = e.id
        JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
        JOIN "Item" i ON it."itemId" = i.id
        JOIN "Tamanho" t ON it."tamanhoId" = t.id
        JOIN "Projeto" p ON i."projetoId" = p.id
        WHERE 1=1
          ${projetoFilter}
          ${tipoGradeFilter}
          ${remessaFilter}
        GROUP BY p.nome, g.status, g."updatedAt", e.nome, e."numeroEscola", i.nome, i.genero, t.nome
      ),
      ordenado AS (
        SELECT *,
          CASE
            WHEN tamanho ~ '^[0-9]+$' THEN LPAD(tamanho, 2, '0') -- números como texto
            ${caseTamanhoOrdem}                                -- letras do array
            ELSE '999'
          END AS tamanho_ordem
        FROM base
      )
      SELECT
        projectname,
        status,
        data,
        escola_nome,
        escola_numero,
        item,
        genero,
        tamanho,
        previsto,
        expedido
      FROM ordenado
      ORDER BY
        projectname,
        CASE status
          WHEN 'DESPACHADA' THEN 2
          WHEN 'EXPEDIDA' THEN 1
          WHEN 'PENDENTE' THEN 3
          ELSE 99
        END,
        data DESC NULLS LAST,
        escola_nome,
        item,
        genero,
        tamanho_ordem;
    `;

      const rows: {
        projectname: string;
        status: string | null;
        data: Date | null;
        escola_nome: string;
        escola_numero: string;
        item: string;
        genero: string;
        tamanho: string;
        previsto: number;
        expedido: number;
      }[] = await this.prisma.$queryRawUnsafe(query);

      if (!rows || rows.length === 0) return [];

      // Agrupamento: projeto → status → data → escola
      const grouped: Record<string, Record<string, Record<string, Record<string, ExpedicaoResumoPDItem[]>>>> = {};

      for (const row of rows) {
        const project = row.projectname;
        const status = (row.status || 'SEM STATUS').toUpperCase();
        const dataStr = row.data ? row.data.toISOString().split('T')[0] : 'null';
        const escolaKey = `${row.escola_nome} - Escola #${row.escola_numero}`;

        grouped[project] ??= {};
        grouped[project][status] ??= {};
        grouped[project][status][dataStr] ??= {};
        grouped[project][status][dataStr][escolaKey] ??= [];

        grouped[project][status][dataStr][escolaKey].push({
          data: dataStr === 'null' ? null : dataStr,
          item: row.item,
          genero: row.genero,
          tamanho: row.tamanho,
          previsto: Number(row.previsto),
          expedido: Number(row.expedido),
          escola: escolaKey,
          tipoLinha: 'item',
        });
      }

      const statusOrder = ['EXPEDIDA', 'DESPACHADA', 'PENDENTE'];
      const resultado: ExpedicaoResumoPDGrouped[] = [];

      for (const [projectname, statuses] of Object.entries(grouped)) {
        let totalGeralPrevisto = 0;
        let totalGeralExpedido = 0;
        const groupedItems: DataAgrupada[] = [];

        const sortedStatuses = Object.keys(statuses).sort((a, b) => {
          const indexA = statusOrder.indexOf(a.toUpperCase());
          const indexB = statusOrder.indexOf(b.toUpperCase());
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        for (const status of sortedStatuses) {
          const statusUpper = status.toUpperCase();

          groupedItems.push({
            data: null,
            items: [{
              data: null,
              item: `STATUS: ${statusUpper}`,
              genero: '',
              tamanho: '',
              previsto: 0,
              expedido: 0,
            }],
          });

          const dateGroups = statuses[status];
          const sortedDates = Object.keys(dateGroups).sort((a, b) => {
            if (a === 'null') return 1;
            if (b === 'null') return -1;
            return new Date(b).getTime() - new Date(a).getTime(); // mais recente → mais antiga
          });

          for (const data of sortedDates) {
            const escolaGroups = dateGroups[data];
            // Ordena escolas pelo número da escola (extraindo o número do formato "Nome - Escola #123")
            const sortedEscolas = Object.keys(escolaGroups).sort((a, b) => {
              const numA = parseInt(a.split('#')[1]) || 0;
              const numB = parseInt(b.split('#')[1]) || 0;
              return numA - numB;
            });

            for (const escola of sortedEscolas) {
              const items = escolaGroups[escola];

              // Ordena dentro da escola por item → genero → tamanho (numéricos primeiro, depois alfabéticos)
              items.sort((x, y) => {
                if (x.item !== y.item) return x.item.localeCompare(y.item);
                if (x.genero !== y.genero) return x.genero.localeCompare(y.genero);

                // Verifica se são tamanhos numéricos (pode ser "2", "02", "04", etc.)
                const isNumX = /^\d+$/.test(x.tamanho);
                const isNumY = /^\d+$/.test(y.tamanho);

                // Se ambos são numéricos, ordena numericamente
                if (isNumX && isNumY) {
                  return parseInt(x.tamanho) - parseInt(y.tamanho);
                }

                // Se ambos são alfabéticos, usa a ordem do array sizes
                if (!isNumX && !isNumY) {
                  const ordX = tamanhoPriority[x.tamanho] ?? 999;
                  const ordY = tamanhoPriority[y.tamanho] ?? 999;
                  return ordX - ordY;
                }

                // Se um é numérico e outro alfabético, numérico vem primeiro
                return isNumX ? -1 : 1;
              });

              const subtotalPrevisto = items.reduce((sum, x) => sum + x.previsto, 0);
              const subtotalExpedido = items.reduce((sum, x) => sum + x.expedido, 0);
              totalGeralPrevisto += subtotalPrevisto;
              totalGeralExpedido += subtotalExpedido;

              // Linha separadora da escola
              groupedItems.push({
                data: data === 'null' ? null : data,
                items: [{
                  data: data === 'null' ? null : data,
                  item: `ESCOLA: ${escola}`,
                  genero: '',
                  tamanho: '',
                  previsto: 0,
                  expedido: 0,
                }],
              });

              // Itens da escola
              groupedItems.push({
                data: data === 'null' ? null : data,
                items: [
                  ...items,
                  {
                    data: data === 'null' ? null : data,
                    item: `Total ${escola}`,
                    genero: '',
                    tamanho: '',
                    previsto: subtotalPrevisto,
                    expedido: subtotalExpedido,
                  },
                ],
              });
            }

            // Total por data (soma de todas as escolas da data)
            const totalDataPrevisto = Object.values(escolaGroups)
              .flat()
              .reduce((sum, item) => sum + item.previsto, 0);
            const totalDataExpedido = Object.values(escolaGroups)
              .flat()
              .reduce((sum, item) => sum + item.expedido, 0);

            groupedItems.push({
              data: data === 'null' ? null : data,
              items: [{
                data: data === 'null' ? null : data,
                item: 'Total da Data',
                genero: '',
                tamanho: '',
                previsto: totalDataPrevisto,
                expedido: totalDataExpedido,
              }],
            });
          }
        }

        groupedItems.push({
          data: null,
          items: [{
            data: null,
            item: 'Total Geral',
            genero: '',
            tamanho: '',
            previsto: totalGeralPrevisto,
            expedido: totalGeralExpedido,
          }],
        });

        resultado.push({ projectname, groupedItems });
      }

      return resultado;
    } catch (error) {
      console.error('Erro ao buscar resumo da expedição com escola:', error);
      throw new Error('Erro ao buscar resumo da expedição com escola');
    }
  }

  async getResumoExpedicaoPDComEscolaPDF(projetoId: number, tipoGrade: number, remessa: number): Promise<Buffer> {
    try {
      const projetoFilter = projetoId === -1 ? '' : `AND i."projetoId" = ${projetoId}`;
      const remessaFilter = remessa === -1 ? '' : `AND g."remessa" = ${remessa}`;

      let tipoGradeFilter = '';
      if (tipoGrade === 1) tipoGradeFilter = `AND g."tipo" IS NULL`;
      else if (tipoGrade === 2) tipoGradeFilter = `AND g."tipo" ILIKE '%REPOS%'`;

      // Mapeia tamanhos alfabéticos para prioridade
      const tamanhoPriority: Record<string, number> = {};
      sizes.forEach((t, idx) => (tamanhoPriority[t] = idx));

      const caseTamanhoOrdem = Object.entries(tamanhoPriority)
        .map(([t, idx]) => `WHEN tamanho = '${t}' THEN '${100 + idx}'`)
        .join('\n');

      const query = `
      WITH base AS (
        SELECT
          p.nome AS projectname,
          g.status AS status,
          g."updatedAt"::date AS data,
          e.nome AS escola_nome,
          e."numeroEscola" AS escola_numero,
          i.nome AS item,
          i.genero::text AS genero,
          t.nome AS tamanho,
          SUM(gi.quantidade) AS previsto,
          SUM(gi."quantidadeExpedida") AS expedido
        FROM "GradeItem" gi
        JOIN "Grade" g ON gi."gradeId" = g.id
        JOIN "Escola" e ON g."escolaId" = e.id
        JOIN "ItemTamanho" it ON gi."itemTamanhoId" = it.id
        JOIN "Item" i ON it."itemId" = i.id
        JOIN "Tamanho" t ON it."tamanhoId" = t.id
        JOIN "Projeto" p ON i."projetoId" = p.id
        WHERE 1=1
          ${projetoFilter}
          ${tipoGradeFilter}
          ${remessaFilter}
        GROUP BY p.nome, g.status, g."updatedAt", e.nome, e."numeroEscola", i.nome, i.genero, t.nome
      ),
      ordenado AS (
        SELECT *,
          CASE
            WHEN tamanho ~ '^[0-9]+$' THEN LPAD(tamanho, 2, '0')
            ${caseTamanhoOrdem}
            ELSE '999'
          END AS tamanho_ordem
        FROM base
      )
      SELECT
        projectname,
        status,
        data,
        escola_nome,
        escola_numero,
        item,
        genero,
        tamanho,
        SUM(previsto) AS previsto,
        SUM(expedido) AS expedido
      FROM ordenado
      GROUP BY projectname, status, data, escola_nome, escola_numero, item, genero, tamanho, tamanho_ordem
      ORDER BY
        projectname,
        CASE status
          WHEN 'DESPACHADA' THEN 2
          WHEN 'EXPEDIDA' THEN 1
          WHEN 'PENDENTE' THEN 3
          ELSE 99
        END,
        data DESC NULLS LAST,
        escola_nome,
        item,
        genero,
        tamanho_ordem;
    `;

      const rows: {
        projectname: string;
        status: string | null;
        data: Date | null;
        escola_nome: string;
        escola_numero: string;
        item: string;
        genero: string;
        tamanho: string;
        previsto: number;
        expedido: number;
      }[] = await this.prisma.$queryRawUnsafe(query);

      if (!rows || rows.length === 0) {
        return gerarPDFExpedicao([]);
      }

      // Agrupamento: projeto → status → data → escola
      const grouped: Record<string, Record<string, Record<string, Record<string, Record<string, ExpedicaoResumoPDItem>>>>> = {};

      for (const row of rows) {
        const project = row.projectname;
        const status = (row.status || 'SEM STATUS').toUpperCase();
        const dataStr = row.data ? row.data.toISOString().split('T')[0] : 'null';
        const escolaKey = `${row.escola_nome} - Escola #${row.escola_numero}`;

        grouped[project] ??= {};
        grouped[project][status] ??= {};
        grouped[project][status][dataStr] ??= {};
        grouped[project][status][dataStr][escolaKey] ??= {};

        // Chave única por item + genero + tamanho
        const key = `${row.item}|${row.genero}|${row.tamanho}`;
        if (!grouped[project][status][dataStr][escolaKey][key]) {
          grouped[project][status][dataStr][escolaKey][key] = {
            data: dataStr === 'null' ? null : dataStr,
            item: row.item,
            genero: row.genero,
            tamanho: row.tamanho,
            previsto: Number(row.previsto),
            expedido: Number(row.expedido),
          };
        } else {
          grouped[project][status][dataStr][escolaKey][key].previsto += Number(row.previsto);
          grouped[project][status][dataStr][escolaKey][key].expedido += Number(row.expedido);
        }
      }

      const statusOrder = ['EXPEDIDA', 'DESPACHADA', 'PENDENTE'];
      const resultado: ExpedicaoResumoPDGrouped[] = [];

      for (const [projectname, statuses] of Object.entries(grouped)) {
        let totalGeralPrevisto = 0;
        let totalGeralExpedido = 0;
        const groupedItems: DataAgrupada[] = [];

        const sortedStatuses = Object.keys(statuses).sort((a, b) => {
          const indexA = statusOrder.indexOf(a.toUpperCase());
          const indexB = statusOrder.indexOf(b.toUpperCase());
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        for (const status of sortedStatuses) {
          const statusUpper = status.toUpperCase();

          groupedItems.push({
            data: null,
            items: [{
              data: null,
              item: `STATUS: ${statusUpper}`,
              genero: '',
              tamanho: '',
              previsto: 0,
              expedido: 0,
            }],
          });

          const dateGroups = statuses[status];
          const sortedDates = Object.keys(dateGroups).sort((a, b) => {
            if (a === 'null') return 1;
            if (b === 'null') return -1;
            return new Date(b).getTime() - new Date(a).getTime();
          });

          for (const data of sortedDates) {
            const escolaGroups = dateGroups[data];
            // Ordena escolas pelo número da escola (extraindo o número do formato "Nome - Escola #123")
            const sortedEscolas = Object.keys(escolaGroups).sort((a, b) => {
              const numA = parseInt(a.split('#')[1]) || 0;
              const numB = parseInt(b.split('#')[1]) || 0;
              return numA - numB;
            });

            for (const escola of sortedEscolas) {
              const itemsMap = escolaGroups[escola];
              const items = Object.values(itemsMap);

              // Ordena por item → genero → tamanho (numéricos primeiro, depois alfabéticos)
              items.sort((x, y) => {
                if (x.item !== y.item) return x.item.localeCompare(y.item);
                if (x.genero !== y.genero) return x.genero.localeCompare(y.genero);

                // Verifica se são tamanhos numéricos (pode ser "2", "02", "04", etc.)
                const isNumX = /^\d+$/.test(x.tamanho);
                const isNumY = /^\d+$/.test(y.tamanho);

                // Se ambos são numéricos, ordena numericamente
                if (isNumX && isNumY) {
                  return parseInt(x.tamanho) - parseInt(y.tamanho);
                }

                // Se ambos são alfabéticos, usa a ordem do array sizes
                if (!isNumX && !isNumY) {
                  const ordX = tamanhoPriority[x.tamanho] ?? 999;
                  const ordY = tamanhoPriority[y.tamanho] ?? 999;
                  return ordX - ordY;
                }

                // Se um é numérico e outro alfabético, numérico vem primeiro
                return isNumX ? -1 : 1;
              });

              const subtotalPrevisto = items.reduce((sum, x) => sum + x.previsto, 0);
              const subtotalExpedido = items.reduce((sum, x) => sum + x.expedido, 0);
              totalGeralPrevisto += subtotalPrevisto;
              totalGeralExpedido += subtotalExpedido;

              // Linha separadora da escola
              groupedItems.push({
                data: data === 'null' ? null : data,
                items: [{
                  data: data === 'null' ? null : data,
                  item: `ESCOLA: ${escola}`,
                  genero: '',
                  tamanho: '',
                  previsto: 0,
                  expedido: 0,
                }],
              });

              // Itens da escola
              groupedItems.push({
                data: data === 'null' ? null : data,
                items: [
                  ...items,
                  {
                    data: data === 'null' ? null : data,
                    item: `Total ${escola}`,
                    genero: '',
                    tamanho: '',
                    previsto: subtotalPrevisto,
                    expedido: subtotalExpedido,
                  },
                ],
              });
            }

            // Total por data
            const totalDataPrevisto = Object.values(escolaGroups)
              .flatMap(escola => Object.values(escola))
              .reduce((sum, item) => sum + item.previsto, 0);
            const totalDataExpedido = Object.values(escolaGroups)
              .flatMap(escola => Object.values(escola))
              .reduce((sum, item) => sum + item.expedido, 0);

            groupedItems.push({
              data: data === 'null' ? null : data,
              items: [{
                data: data === 'null' ? null : data,
                item: 'Total da Data',
                genero: '',
                tamanho: '',
                previsto: totalDataPrevisto,
                expedido: totalDataExpedido,
              }],
            });
          }
        }

        groupedItems.push({
          data: null,
          items: [{
            data: null,
            item: 'Total Geral',
            genero: '',
            tamanho: '',
            previsto: totalGeralPrevisto,
            expedido: totalGeralExpedido,
          }],
        });

        resultado.push({ projectname, groupedItems });
      }

      const pdfBuffer: Buffer = await gerarPDFExpedicaoComEscola(resultado);

      return pdfBuffer;
    } catch (error) {
      console.error('Erro ao buscar resumo da expedição com escola e gerar o pdf:', error);
      throw new Error('Erro ao buscar resumo da expedição com escola e gerar o pdf');
    }
  }

}
