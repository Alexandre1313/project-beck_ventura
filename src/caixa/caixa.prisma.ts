import { Caixa, CaixaAjuste, CaixaFindItem, convertSPTime } from '@core/index';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaProvider } from 'src/db/prisma.provider';

@Injectable()
export class CaixaPrisma {
  constructor(private readonly prisma: PrismaProvider) { }

  async inserirCaixaEItens(caixaData: Caixa): Promise<Caixa> {
    const { caixaItem, itensGrade, userId, ...dadosDaCaixa } = caixaData;

    const gradeId = Number(dadosDaCaixa.gradeId);
    if (isNaN(gradeId)) throw new Error("GradeId inválido.");

    try {
      const result = await this.prisma.$transaction(async (prisma) => {

        /*const caixasDaGrade = await prisma.caixa.findMany({
          where: { gradeId: gradeId },
          select: { caixaNumber: true },
        });

        const maiorNumero = caixasDaGrade
          .map(c => Number(c.caixaNumber))
          .filter(n => !isNaN(n))
          .sort((a, b) => b - a)[0] ?? 0;

        const proximaCaixaNumber = String(maiorNumero + 1).padStart(2, "0");*/

        const novaCaixa = await prisma.caixa.create({
          data: {
            gradeId: gradeId,
            escolaNumber: dadosDaCaixa.escolaNumber,
            numberJoin: dadosDaCaixa.numberJoin,
            qtyCaixa: dadosDaCaixa.qtyCaixa,
            projeto: dadosDaCaixa.projeto,
            escolaCaixa: dadosDaCaixa.escolaCaixa,
            caixaNumber: dadosDaCaixa.caixaNumber,
            tipoEmbalagemId: dadosDaCaixa.tipoEmbalagemId,
            userId: userId,
          },
        });

        if (!novaCaixa) throw new Error("Caixa não criada !");

        const itensCriados = [];

        for (const item of caixaItem) {
          const criado = await prisma.caixaItem.create({
            data: {
              itemName: item.itemName,
              itemGenero: item.itemGenero,
              itemTam: item.itemTam,
              itemQty: item.itemQty,
              itemTamanhoId: item.itemTamanhoId,
              caixaId: novaCaixa.id,
            },
          });
          itensCriados.push(criado);
        }

        for (const item of itensGrade) {
          const itemDB = await prisma.gradeItem.findUnique({
            where: { id: item.id },
          });

          if (!itemDB) {
            throw new Error(`Item com ID ${item.id} não encontrado.`);
          }

          if (item.quantidadeExpedida > itemDB.quantidade) {
            throw new Error(
              `A quantidade expedida (${item.quantidadeExpedida}) não pode ser maior que a quantidade solicitada (${itemDB.quantidade}) para o item ${item.id}.`
            );
          }

          await prisma.gradeItem.update({
            where: { id: item.id },
            data: { quantidadeExpedida: item.quantidadeExpedida },
          });
        }

        for (const item of caixaItem) {
          const { itemTamanhoId, itemQty } = item;

          const itemTamanho = await prisma.itemTamanho.findUnique({
            where: { id: itemTamanhoId },
            include: {
              kitMain: {
                include: {
                  component: {
                    include: {
                      estoque: true,
                    },
                  },
                },
              },
            },
          });

          if (!itemTamanho) {
            throw new Error(`ItemTamanho com id ${itemTamanhoId} não encontrado.`);
          }

          if (itemTamanho.isKit) {
            for (const componente of itemTamanho.kitMain) {
              const estoqueAtual = componente.component.estoque;
              const qtdNecessaria = componente.quantidade * itemQty;
              const novaQuantidade = estoqueAtual.quantidade - qtdNecessaria;

              await prisma.estoque.update({
                where: { itemTamanhoId: componente.componentId },
                data: {
                  quantidade: novaQuantidade,
                },
              });

              await prisma.outInput.create({
                data: {
                  itemTamanhoId: componente.componentId,
                  estoqueId: estoqueAtual.id,
                  quantidade: qtdNecessaria,
                  userId,
                  gradeId,
                  caixaId: novaCaixa.id,
                  kitOutput: true,
                  kitOrigemId: itemTamanho.id,
                },
              });
            }
          } else {
            const estoqueAtual = await prisma.estoque.findUnique({
              where: { itemTamanhoId },
            });

            const novaQuantidade = estoqueAtual.quantidade - itemQty;

            await prisma.estoque.update({
              where: { itemTamanhoId },
              data: { quantidade: novaQuantidade },
            });

            await prisma.outInput.create({
              data: {
                itemTamanhoId,
                estoqueId: estoqueAtual.id,
                quantidade: itemQty,
                userId,
                gradeId,
                caixaId: novaCaixa.id,
              },
            });
          }
        }

        const itensDaGrade = await prisma.gradeItem.findMany({
          where: { gradeId: gradeId },
        });

        const todosExpedidos = itensDaGrade.every(
          (item) => item.quantidadeExpedida === item.quantidade
        );

        if (todosExpedidos) {
          await prisma.grade.update({
            where: { id: gradeId },
            data: { status: "EXPEDIDA", finalizada: true },
          });
        }

        console.log(novaCaixa)

        return {
          ...novaCaixa,
          caixaItem: itensCriados,
          itensGrade: [],
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      });

      return result;
    } catch (error: any) {
      console.error("", error);
      throw new Error("Erro ao inserir a caixa: " + error.message);
    }
  }

  async getCaixasComItensPorGradeId(gradeId: number): Promise<(Omit<Caixa, 'usuario'> & { usuario: string })[]> {
    try {
      const caixas = await this.prisma.caixa.findMany({
        where: { gradeId },
        include: {
          caixaItem: true,
          usuario: {
            select: {
              nome: true,
            },
          },
          grade: { select: { updatedAt: true, status: true, createdAt: true } },
        },
      });

      if (!caixas) return [];

      const caixasComUsuarioNome = caixas.map((caixa) => ({
        ...caixa,
        usuario: caixa.usuario?.nome ?? 'Desconhecido',
      }));

      // Ordenar de forma numérica decrescente, mesmo sendo texto no banco
      return caixasComUsuarioNome.sort(
        (a, b) => Number(b.caixaNumber) - Number(a.caixaNumber)
      );
    } catch (error) {
      console.error("Erro ao buscar caixas:", error);
      throw error;
    }
  }

  async getCaixaById(caixaId: number): Promise<CaixaAjuste | null> {
    try {
      const caixa = await this.prisma.caixa.findUnique({
        where: {
          id: caixaId,
        },
        include: {
          caixaItem: true, // inclui os itens da caixa
          grade: {
            include: {
              escola: {
                include: {
                  projeto: true, // inclui o projeto ao qual a escola pertence
                },
              },
            },
          },
        },
      });

      if (!caixa) {
        return null;
      }

      return {
        id: caixa.id,
        gradeId: caixa.gradeId,
        status: String(caixa.grade.status),
        caixaNumber: caixa.caixaNumber,
        qtyCaixa: caixa.qtyCaixa,
        createdAt: convertSPTime(String(caixa.createdAt)),
        updatedAt: convertSPTime(String(caixa.updatedAt)),
        projeto: caixa.grade.escola.projeto.nome,
        projetoId: caixa.grade.escola.projeto.id,
        escola: caixa.grade.escola.nome,
        escolaNumero: caixa.grade.escola.numeroEscola,
        escolaId: caixa.grade.escola.id,
        itens: caixa.caixaItem.map((item) => ({
          id: item.id,
          caixaId: item.caixaId,
          itemName: item.itemName,
          itemGenero: item.itemGenero,
          itemTam: item.itemTam,
          itemQty: item.itemQty,
          itemTamanhoId: item.itemTamanhoId,
          updatedAt: convertSPTime(String(item.updatedAt)),
          createdAt: convertSPTime(String(item.createdAt)),
        })),
      };
    } catch (error) {
      console.error('Erro ao buscar a caixa:', error);
      throw error;
    }
  }

  async updateItensByBox(caixaData: CaixaAjuste): Promise<CaixaAjuste | null | (CaixaAjuste & { status: string; mensagem: string })> {
    if (!caixaData) return null;

    const { id, gradeId, itens } = caixaData;

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const result = await this.prisma.$transaction(async (prisma) => {
          // 1. Verificar se a caixa existe
          const caixaAtual = await prisma.caixa.findUnique({
            where: { id },
            include: { caixaItem: true }
          });

          if (!caixaAtual) {
            throw new Error(`Caixa não encontrada: ${id}`);
          }

          // 2. Processar cada item da requisição
          for (const item of itens) {
            const { itemTamanhoId, itemQty } = item;

            // Buscar ItemTamanho com informações de kit
            const itemTamanho = await prisma.itemTamanho.findUnique({
              where: { id: itemTamanhoId },
              include: {
                estoque: true,
                kitMain: {
                  include: {
                    component: {
                      include: {
                        estoque: true
                      }
                    }
                  }
                }
              }
            });

            if (!itemTamanho) {
              throw new Error(`ItemTamanho não encontrado: ${itemTamanhoId}`);
            }


            // Buscar CaixaItem atual
            const caixaItemAtual = await prisma.caixaItem.findFirst({
              where: { caixaId: id, itemTamanhoId }
            });

            if (!caixaItemAtual) {
              throw new Error(`CaixaItem não encontrado para itemTamanhoId=${itemTamanhoId}`);
            }

            const quantidadeAtual = caixaItemAtual.itemQty;
            const diff = quantidadeAtual - itemQty;

            /* 🔍 DEBUG LOG
            console.log(`
              🔍 AJUSTE DE ITEM:
              ItemTamanhoId: ${itemTamanhoId}
              Quantidade Atual (CaixaItem): ${quantidadeAtual}
              Nova Quantidade (itemQty): ${itemQty}
              Diferença (diff): ${diff}
              É Kit?: ${itemTamanho.isKit}
            `);*/

            if (itemTamanho.isKit) {
              // PROCESSAR KIT

              // 1. PROCESSAR COMPONENTES DO KIT (OutInput e Estoque)
              for (const kitComponent of itemTamanho.kitMain) {
                const componenteId = kitComponent.componentId;
                const qtdPorKit = kitComponent.quantidade;

                // Diferença de kits: quantidadeAtual - itemQty
                const diffKits = quantidadeAtual - itemQty;

                // Diferença de componentes: diffKits * qtdPorKit
                const diffComponentes = diffKits * qtdPorKit;

                // Buscar OutInput do componente
                const outInputComponente = await prisma.outInput.findFirst({
                  where: {
                    caixaId: id,
                    itemTamanhoId: componenteId,
                    gradeId,
                    kitOrigemId: itemTamanhoId
                  }
                });

                if (!outInputComponente) {
                  throw new Error(`OutInput não encontrado para componente ${componenteId} do kit ${itemTamanhoId}`);
                }

                if (itemQty === 0) {
                  // Zerar kit - excluir OutInput do componente
                  await prisma.outInput.delete({ where: { id: outInputComponente.id } });

                  // Devolver quantidade total do componente para estoque
                  await prisma.estoque.update({
                    where: { id: outInputComponente.estoqueId },
                    data: {
                      quantidade: {
                        increment: outInputComponente.quantidade
                      }
                    }
                  });
                } else {
                  // Atualizar quantidade do componente no OutInput
                  const novaQuantidadeComponente = itemQty * qtdPorKit;

                  await prisma.outInput.update({
                    where: { id: outInputComponente.id },
                    data: { quantidade: novaQuantidadeComponente }
                  });

                  // Ajustar estoque se houver diferença
                  if (diffComponentes !== 0) {
                    // ✅ CORREÇÃO: diffComponentes já tem o sinal correto
                    // Se positivo: devolver para estoque | Se negativo: retirar do estoque
                    await prisma.estoque.update({
                      where: { id: outInputComponente.estoqueId },
                      data: {
                        quantidade: {
                          increment: diffComponentes // ✅ CORRETO: Prisma increment aceita valores negativos
                        }
                      }
                    });
                  }
                }
              }

              // 2. PROCESSAR GRADEITEM DO KIT (não dos componentes)
              const gradeItemKit = await prisma.gradeItem.findFirst({
                where: {
                  itemTamanhoId: itemTamanhoId, // Kit em si
                  gradeId
                }
              });

              if (gradeItemKit) {
                if (itemQty === 0) {
                  // Zerar quantidade expedida do kit para permitir expedir novamente
                  await prisma.gradeItem.update({
                    where: { id: gradeItemKit.id },
                    data: {
                      quantidadeExpedida: {
                        decrement: quantidadeAtual
                      }
                    }
                  });
                } else {
                  // Ajustar quantidade expedida do kit
                  if (diff !== 0) {
                    await prisma.gradeItem.update({
                      where: { id: gradeItemKit.id },
                      data: {
                        quantidadeExpedida: {
                          decrement: diff
                        }
                      }
                    });
                  }
                }
              }

              // 3. PROCESSAR CAIXAITEM DO KIT (não dos componentes)
              if (itemQty === 0) {
                await prisma.caixaItem.delete({ where: { id: caixaItemAtual.id } });
              } else {
                await prisma.caixaItem.update({
                  where: { id: caixaItemAtual.id },
                  data: { itemQty }
                });
              }
            } else {
              // PROCESSAR ITEM NORMAL
              const outInputItem = await prisma.outInput.findFirst({
                where: {
                  caixaId: id,
                  itemTamanhoId,
                  gradeId,
                  kitOrigemId: null // Item normal não tem kitOrigemId
                }
              });

              if (!outInputItem) {
                throw new Error(`OutInput não encontrado para item normal ${itemTamanhoId}`);
              }

              if (itemQty === 0) {
                /* 🔍 DEBUG LOG ZERAR
                console.log(`
                  🗑️ ZERANDO ITEM (DELETANDO):
                  ItemTamanhoId: ${itemTamanhoId}
                  Quantidade em OutInput: ${outInputItem.quantidade}
                  EstoqueId: ${outInputItem.estoqueId}
                  Vai devolver: +${outInputItem.quantidade} para estoque
                `);*/

                // Zerar item - excluir OutInput e devolver para estoque
                await prisma.outInput.delete({ where: { id: outInputItem.id } });

                // Devolver quantidade para estoque
                await prisma.estoque.update({
                  where: { id: outInputItem.estoqueId },
                  data: {
                    quantidade: {
                      increment: outInputItem.quantidade
                    }
                  }
                });

                // Devolver quantidade expedida na GradeItem
                const gradeItem = await prisma.gradeItem.findFirst({
                  where: {
                    itemTamanhoId,
                    gradeId
                  }
                });

                if (gradeItem) {
                  await prisma.gradeItem.update({
                    where: { id: gradeItem.id },
                    data: {
                      quantidadeExpedida: {
                        decrement: outInputItem.quantidade
                      }
                    }
                  });
                }

                // Excluir CaixaItem
                await prisma.caixaItem.delete({ where: { id: caixaItemAtual.id } });
              } else {
                // Atualizar quantidade do item
                await prisma.outInput.update({
                  where: { id: outInputItem.id },
                  data: { quantidade: itemQty }
                });

                // Ajustar estoque e GradeItem se houver diferença
                if (diff !== 0) {
                  /* 🔍 DEBUG LOG ESTOQUE
                  console.log(`
                    📦 AJUSTANDO ESTOQUE (ITEM NORMAL):
                    ItemTamanhoId: ${itemTamanhoId}
                    EstoqueId: ${outInputItem.estoqueId}
                    Increment: ${diff}
                    (Se positivo: devolve | Se negativo: retira)
                  `);*/

                  // Ajustar estoque (se diff > 0, devolve para estoque)
                  await prisma.estoque.update({
                    where: { id: outInputItem.estoqueId },
                    data: {
                      quantidade: {
                        increment: diff
                      }
                    }
                  });

                  // Ajustar GradeItem
                  const gradeItem = await prisma.gradeItem.findFirst({
                    where: {
                      itemTamanhoId,
                      gradeId
                    }
                  });

                  if (gradeItem) {
                    await prisma.gradeItem.update({
                      where: { id: gradeItem.id },
                      data: {
                        quantidadeExpedida: {
                          decrement: diff
                        }
                      }
                    });
                  }
                }

                // Atualizar CaixaItem
                await prisma.caixaItem.update({
                  where: { id: caixaItemAtual.id },
                  data: { itemQty }
                });
              }
            }
          }

          // 3. Verificar se caixa deve ser excluída (todos itens zerados)
          const caixaItemsRestantes = await prisma.caixaItem.findMany({
            where: { caixaId: id }
          });

          if (caixaItemsRestantes.length === 0) {
            // Excluir caixa e reordenar números das caixas posteriores
            const numeroExcluido = parseInt(caixaAtual.caixaNumber, 10);

            // Buscar caixas para reordenar
            const todasCaixas = await prisma.caixa.findMany({
              where: {
                gradeId: caixaAtual.gradeId
              }
            });

            const caixasPosteriores = todasCaixas
              .filter(caixa => parseInt(caixa.caixaNumber) > numeroExcluido)
              .sort((a, b) => parseInt(a.caixaNumber) - parseInt(b.caixaNumber));

            // Excluir todos os OutInput da caixa
            await prisma.outInput.deleteMany({
              where: { caixaId: id }
            });

            // Excluir a caixa
            await prisma.caixa.delete({ where: { id } });

            // Reordenar caixas posteriores (decrementar números)
            if (caixasPosteriores.length > 0) {
              for (const caixa of caixasPosteriores) {
                const numeroAtual = parseInt(caixa.caixaNumber, 10);
                const novoNumero = (numeroAtual - 1).toString();
                await prisma.caixa.update({
                  where: { id: caixa.id },
                  data: { caixaNumber: novoNumero }
                });
              }
            }

            // Retornar objeto indicando que a caixa foi excluída
            return {
              ...caixaData,
              status: 'EXCLUIDA',
              mensagem: 'Caixa foi excluída pois todos os itens foram zerados',
              qtyCaixa: 0,
              itens: []
            } as CaixaAjuste & { status: string; mensagem: string };
          } else {
            // Atualizar quantidade total da caixa baseada nos dados da requisição
            const totalQuantidade = itens.reduce((sum, item) => sum + item.itemQty, 0);
            await prisma.caixa.update({
              where: { id },
              data: { qtyCaixa: totalQuantidade }
            });
          }

        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 20000,
          maxWait: 5000
        });

        // Se a transação retornou um objeto com status, é uma exclusão
        if (result && typeof result === 'object' && 'status' in result) {
          return result;
        }

        // Caso contrário, buscar dados atualizados da caixa (fora da transação)
        return await this.getCaixaById(id);

      } catch (err: any) {
        if (err.code === 'P2034') {
          attempt++;
          console.warn(`Conflito de transação (tentativa ${attempt} de ${MAX_RETRIES})`);
          if (attempt === MAX_RETRIES) {
            throw new Error("Transação falhou após múltiplas tentativas (P2034)");
          }
          continue;
        }

        console.error("Erro inesperado ao atualizar itens da caixa:", err);
        throw new Error("Erro ao modificar dados da caixa: " + err.message);
      }
    }

    return null;
  }

  async findCaixasByGradeAndItemTamanho(gradeId: number, itemTamanhoId: number): Promise<CaixaFindItem[]> {
    const caixaFindItem = await this.prisma.$queryRaw<CaixaFindItem[]>`
    SELECT
      c.id,
      c."gradeId",
      c."escolaCaixa",
      c."escolaNumber",
      c."projeto",
      c."qtyCaixa",
      c."caixaNumber",
      c."createdAt",
      c."updatedAt",
      c."userId",
      c."numberJoin",
      c."tipoEmbalagemId",
      json_agg(
        json_build_object(
          'id', ci.id,
          'caixaId', ci."caixaId",
          'itemName', ci."itemName",
          'itemGenero', ci."itemGenero",
          'itemTam', ci."itemTam",
          'itemQty', ci."itemQty",
          'itemTamanhoId', ci."itemTamanhoId",
          'createdAt', ci."createdAt",
          'updatedAt', ci."updatedAt"
        )
      ) AS "caixaItem"
    FROM "Caixa" c
    JOIN "CaixaItem" ci ON ci."caixaId" = c.id
    WHERE c."gradeId" = ${gradeId}
      AND ci."itemTamanhoId" = ${itemTamanhoId}
    GROUP BY c.id
    ORDER BY CAST(c."caixaNumber" AS INTEGER) DESC
  `;
    return caixaFindItem;
  }

}
