import { Escola, EscolaGradesItems } from '@core/index';
import { sizeOrders } from '@core/utils/utils';
import { Injectable } from '@nestjs/common';
import { PrismaProvider } from 'src/db/prisma.provider';

@Injectable()
export class EscolaPrisma {
  constructor(readonly prisma: PrismaProvider) { }

  async salvar(escola: Escola): Promise<Escola> {
    const { id, projeto, grades, ...dadosDaEscola } = escola;

    // Verifica se já existe uma escola com o mesmo nome para o mesmo projeto
    const escolaExistente = await this.prisma.escola.findFirst({
      where: {
        nome: dadosDaEscola.nome,
        projetoId: dadosDaEscola.projetoId,
      },
    });

    // Se uma escola com o mesmo nome e projeto já existe e não é a atual, lance um erro
    if (escolaExistente && escolaExistente.id !== id) {
      throw new Error('Já existe uma escola com este nome associada a este projeto.');
    }

    // Realiza o upsert no banco de dados
    const escolaSalva = await this.prisma.escola.upsert({
      where: {
        id: id !== undefined ? +id : -1, // Usar -1 para id inexistente
      },
      update: {
        ...dadosDaEscola,
      },
      create: {
        ...dadosDaEscola,
      },
    });

    return escolaSalva; // Retorne a escola salva
  }

  async obter(): Promise<Escola[]> {
    const escolas = await this.prisma.escola.findMany();
    return escolas;
  }

  async obterPorId(id: number): Promise<Escola | null> {
    const escola = await this.prisma.escola.findUnique({
      where: { id },
      include: {
        projeto: true,
        grades: true,
      },
    });
    return (escola as Escola) ?? null;
  }

  async encontrarEscolaPorIdCompleta(id: number): Promise<Escola> {
    const escola = await this.prisma.escola.findUnique({
      where: { id },
      include: {
        projeto: true,
        grades: {
          take: 6, // Limitar a 6 grades
          orderBy: {
            createdAt: 'desc', // Ordenar por data de criação, mais recentes primeiro
          },
          include: {
            itensGrade: {
              include: {
                itemTamanho: {
                  include: {
                    item: true,
                    tamanho: true,
                    barcode: true,
                    estoque: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!escola) {
      throw new Error('Escola não encontrada');
    }
    console.log(JSON.stringify(escola, null, 2));
    return escola as Escola;
  }

  async getGradesWithItemsAndStock(id: number) {
    const escolaComGrades = await this.prisma.escola.findUnique({
      where: { id },
      select: {
        id: true,
        numeroEscola: true,
        numberJoin: true,
        nome: true,
        projetoId: true,
        projeto: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            url: true,
          },
        },
        grades: {
          select: {
            id: true,
            tipo: true,
            finalizada: true,
            status: true,
            companyId: true,
            escolaId: true,
            updatedAt: true,
            company: {
              select: {
                id: true,
                nome: true,
                email: true,
                cnpj: true,
              },
            },
            gradeCaixas: {
              select: {
                id: true,
                gradeId: true,
                escolaCaixa: true,
                escolaNumber: true,
                numberJoin: true,
                projeto: true,
                qtyCaixa: true,
                caixaNumber: true,
                userId: true,
                caixaItem: {
                  select: {
                    id: true,
                    itemName: true,
                    itemGenero: true,
                    itemTam: true,
                    itemQty: true,
                    caixaId: true,
                    itemTamanhoId: true,
                  },
                },
              },
            },
            itensGrade: {
              select: {
                id: true,
                quantidade: true,
                quantidadeExpedida: true,
                qtyPCaixa: true,
                isCount: true,
                itemTamanhoId: true,
                itemTamanho: {
                  select: {
                    id: true,
                    itemId: true,
                    tamanhoId: true,
                    barcode: {
                      select: {
                        id: true,
                        codigo: true,
                        itemTamanhoId: true,
                      },
                    },
                    estoque: {
                      select: {
                        id: true,
                        quantidade: true,
                        itemTamanhoId: true,
                      },
                    },
                    item: {
                      select: {
                        id: true,
                        nome: true,
                        genero: true,
                        composicao: true,
                        projetoId: true,
                      },
                    },
                    tamanho: {
                      select: {
                        id: true,
                        nome: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                itemTamanho: {
                  item: {
                    nome: 'asc',
                  },
                },
              },
            },
          },
          where: {
            OR: [
              { status: { not: 'DESPACHADA' } }, // Incluir grades com status diferente de 'DESPACHADA'
              {
                status: 'DESPACHADA', // Incluir grades com status 'DESPACHADA'
                updatedAt: {
                  gte: new Date(new Date().getTime() - 30 * 60 * 1000), // Apenas grades com 'DESPACHADA' atualizadas na última meia hora
                },
              },
            ],
          },
        },
      },
    });    

    // Processar e ordenar os dados
    escolaComGrades.grades.forEach((grade) => {
      // Ordena os itensGrade
      grade.itensGrade = grade.itensGrade.sort((a, b) => {
        // Ordenar por item.nome e item.genero
        if (a.itemTamanho.item.nome !== b.itemTamanho.item.nome) {
          return a.itemTamanho.item.nome.localeCompare(b.itemTamanho.item.nome);
        }
        if (a.itemTamanho.item.genero !== b.itemTamanho.item.genero) {
          return a.itemTamanho.item.genero.localeCompare(b.itemTamanho.item.genero);
        }

        // Ordenar os tamanhos
        const sortTamanho = (tamanho: string): number => {
          const numericRegex = /^\d+$/; // Verifica se é numérico
          const sizeOrder = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'EX', 'EGG', 'EXG', 'XGG', 'EXGG', 'G1', 'G2', 'G3', 'EG/LG']; // Ordem para tamanhos literais

          if (numericRegex.test(tamanho)) {
            return parseInt(tamanho, 10); // Valores numéricos
          } else if (sizeOrder.includes(tamanho)) {
            return sizeOrder.indexOf(tamanho) + 1000; // Literais com peso fixo após numéricos
          } else {
            return tamanho.charCodeAt(0) + 2000; // Outros tamanhos
          }
        };

        return sortTamanho(a.itemTamanho.tamanho.nome) - sortTamanho(b.itemTamanho.tamanho.nome);
      });
    });

    return escolaComGrades;
  }

  async excluir(id: number): Promise<void> {
    try {
      // Tente excluir o item com o ID fornecido
      await this.prisma.escola.delete({ where: { id } });
    } catch (error) {
      // Aqui você pode capturar e tratar o erro
      console.error('Erro ao excluir a escola:', error);

      // Lançar um erro apropriado ou lançar uma exceção
      if (error.code === 'P2025') {
        // Erro específico quando o registro não é encontrado
        throw new Error('O escola não foi encontrada.');
      } else {
        // Lidar com outros erros genéricos
        throw new Error('Erro ao tentar excluir a escola. Por favor, tente novamente.');
      }
    }
  }

  async buscarDadosEscolaByItemsAndGrades(escolaId: number): Promise<EscolaGradesItems | null> {
    try {
      const escola = await this.prisma.escola.findUnique({
        where: { id: escolaId },
        include: {
          projeto: {
            select: {
              id: true,
              nome: true,
              descricao: true,
              url: true,
            },
          },
          grades: {
            take: 6, // Limita a 10 grades mais recentes
            orderBy: {
              createdAt: 'desc', // Ordena as grades pela data de criação, mais recente primeiro
            },
            include: {
              company: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                  cnpj: true,
                },
              },
              gradeCaixas: {
                select: {
                  id: true,
                  gradeId: true,
                  escolaCaixa: true,
                  caixaNumber: true,
                  escolaNumber: true,
                  numberJoin: true,
                  projeto: true,
                  qtyCaixa: true,
                  userId: true,
                  caixaItem: {
                    select: {
                      id: true,
                      caixaId: true,
                      itemName: true,
                      itemGenero: true,
                      itemTam: true,
                      itemQty: true,
                      itemTamanhoId: true,
                    },
                  },
                },
              },
              itensGrade: {
                include: {
                  itemTamanho: {
                    include: {
                      tamanho: {
                        select: {
                          id: true,
                          nome: true,
                        },
                      },
                      item: {
                        select: {
                          id: true,
                          nome: true,
                          composicao: true,
                          genero: true,
                        },
                      },
                      barcode: {
                        select: {
                          id: true,
                          codigo: true,
                        },
                      },
                      estoque: {
                        select: {
                          id: true,
                          quantidade: true,
                          itemTamanho: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Se não encontrar a escola
      if (!escola) {
        return null;
      }

      // Função para mapear o status para um valor numérico para facilitar a ordenação
      const statusPriority = (status: string) => {
        switch (status) {
          case 'PENDENTE': return 1;
          case 'EXPEDIDA': return 2;
          case 'IMPRESSA': return 3;
          case 'DESPACHADA': return 4;
          default: return 5;  // Caso haja um status desconhecido
        }
      };     

      // Ordenando as grades: primeiro por status, depois por data (assumindo que a data de criação é um campo na grade)
      const sortedGrades = escola.grades
        .sort((a, b) => {
          const statusDiff = statusPriority(a.status) - statusPriority(b.status);
          if (statusDiff !== 0) {
            return statusDiff;
          }
          // Se os status forem iguais, ordene por data de criação (assumindo que existe um campo "createdAt")
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Mais recente primeiro
        });

      // Montando a estrutura do retorno
      const resultado: EscolaGradesItems = {
        id: escola.id,
        numeroEscola: escola.numeroEscola,
        numberJoin: escola.numberJoin,
        nome: escola.nome,
        projetoId: escola.projeto.id,
        projeto: {
          id: escola.projeto.id,
          nome: escola.projeto.nome,
        },
        grades: sortedGrades.map(grade => ({
          id: grade.id,
          tipo: grade.tipo,
          finalizada: grade.finalizada,
          companyId: grade.companyId,
          escolaId: grade.escolaId,
          status: grade.status,
          company: {
            id: grade.company.id,
            nome: grade.company.nome,
            email: grade.company.email,
            cnpj: grade.company.cnpj,
          },
          gradeCaixas: grade.gradeCaixas.map(caixa => ({
            id: caixa.id,
            gradeId: caixa.gradeId,
            escolaCaixa: caixa.escolaCaixa,
            escolaNumber: caixa.escolaNumber,
            numberJoin: caixa.numberJoin,
            projeto: caixa.projeto,
            qtyCaixa: caixa.qtyCaixa,
            caixaNumber: caixa.caixaNumber,
            userId: caixa.userId,
            caixaItem: caixa.caixaItem.map(item => ({
              id: item.id,
              itemName: item.itemName,
              itemGenero: item.itemGenero,
              itemTam: item.itemTam,
              itemQty: item.itemQty,
              caixaId: caixa.id,
              itemTamanhoId: item.itemTamanhoId,
            })),
          })),
          itensGrade: grade.itensGrade.map(item => ({
            id: item.id,
            quantidade: item.quantidade,
            quantidadeExpedida: item.quantidadeExpedida,
            qtyPCaixa: item.qtyPCaixa,
            isCount: item.isCount,
            itemTamanhoId: item.itemTamanhoId,
            itemTamanho: {
              id: item.itemTamanho.id,
              itemNome: item.itemTamanho.item.nome,
              itemGenero: item.itemTamanho.item.genero,
              itemComposicao: item.itemTamanho.item.composicao,
              itemId: item.itemTamanho.item.id,
              tamanhoNome: item.itemTamanho.tamanho.nome,
              tamanhoId: item.itemTamanho.tamanho.id,
              barcode: item.itemTamanho.barcode.codigo,
              barcodeId: item.itemTamanho.barcode.id,
              estoque: item.itemTamanho.estoque.quantidade,
              estoqueId: item.itemTamanho.estoque.id,
            },
          })).sort(
            (a, b) => {
              if (a.itemTamanho.itemNome < b.itemTamanho.itemNome) return -1;
              if (a.itemTamanho.itemNome > b.itemTamanho.itemNome) return 1;
              if (a.itemTamanho.itemGenero < b.itemTamanho.itemGenero) return -1;
              if (a.itemTamanho.itemGenero > b.itemTamanho.itemGenero) return 1;
              const tamanhos = [a.itemTamanho.tamanhoNome, b.itemTamanho.tamanhoNome];
              const tamanhosOrdenados = sizeOrders(tamanhos);
              return tamanhosOrdenados.indexOf(a.itemTamanho.tamanhoNome) - tamanhosOrdenados.indexOf(b.itemTamanho.tamanhoNome);
            }
          ),
        })),
      };

      return resultado;
    } catch (error) {
      console.error("Erro ao buscar dados da escola:", error);
      return null;
    }
  }

}
