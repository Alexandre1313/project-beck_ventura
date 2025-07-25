import { Caixa, convertSPTime, GradeItem, GradeOpenBySchool, GradesRomaneio, Grafo, ProjectItems, Projeto, ProjetosSimp, ProjetoStockItems } from '@core/index';
import { sizeOrders } from '@core/utils/utils';
import { Injectable } from '@nestjs/common';
import { Escola, Grade, Prisma } from '@prisma/client';
import { isAfter, subMinutes } from 'date-fns';
import { PrismaProvider } from 'src/db/prisma.provider';

@Injectable()
export class ProjetoPrisma {
  constructor(readonly prisma: PrismaProvider) { }

  async salvar(projeto: Projeto): Promise<Projeto> {
    const { id, escolas, itens, ...dadosDoProjeto } = projeto;

    const projetoSalvo = await this.prisma.projeto.upsert({
      where: {
        id: id !== undefined ? +id : -1,
      },
      update: {
        ...dadosDoProjeto,
        // Aqui você pode adicionar lógica específica para atualizar itens ou escolas se necessário
      },
      create: {
        ...dadosDoProjeto,
        // Aqui você pode adicionar lógica específica para criar itens ou escolas se necessário
      },
    });
    return projetoSalvo; // Retorne o projeto salvo
  }

  async obterProjetosSimp(): Promise<ProjetosSimp[]> {
    const projetos: ProjetosSimp[] = await this.prisma.projeto.findMany({
      select: {
        id: true,
        nome: true,
      },
      orderBy: {
        nome: 'asc',
      },
    });
    return projetos;
  }

  async obter(): Promise<Projeto[]> {
    const projetos = await this.prisma.projeto.findMany();
    return projetos;
  }

  async obterAll(): Promise<Projeto[]> {
    const projetos = await this.prisma.projeto.findMany();
    return projetos;
  }

  async obterPorId(id: number): Promise<Projeto | null> {
    const projeto = await this.prisma.projeto.findUnique({ where: { id } });
    return (projeto as Projeto) ?? null;
  }

  async obterPorIdEscolas(id: number): Promise<(Omit<Projeto, 'escolas'> & { escolas: (Omit<Escola, 'grades'> & { grades: (Grade & { iniciada: boolean })[]; })[]; }) | null> {
    const projeto = await this.prisma.projeto.findUnique({
      where: { id },
      include: {
        escolas: {
          include: {
            grades: {
              orderBy: { createdAt: 'desc' },
              take: 7,
              include: {
                // Inclui apenas para uso interno
                itensGrade: {
                  select: { quantidadeExpedida: true },
                },
              },
            },
          },
        },
      },
    });

    if (!projeto) return null;

    const limite = subMinutes(new Date(), 30);

    const resultado = {
      ...projeto,
      escolas: projeto.escolas.map((escola) => ({
        ...escola,
        grades: escola.grades
          .filter((grade) => {
            if (grade.status === 'DESPACHADA') {
              return isAfter(grade.updatedAt, limite);
            }
            return true;
          })
          .map((grade) => {
            const iniciada = grade.itensGrade.some(
              (item) => item.quantidadeExpedida > 0
            );
            // Retorna grade com iniciada, mas sem os gradeItens
            const { itensGrade, ...resto } = grade;
            return {
              ...resto,
              iniciada,
            };
          }),
      })),
    };

    return resultado;
  }

  async excluir(id: number): Promise<void> {
    try {
      // Tente excluir o item com o ID fornecido
      await this.prisma.projeto.delete({ where: { id } });
    } catch (error) {
      // Aqui você pode capturar e tratar o erro
      console.error('Erro ao excluir o projeto:', error);

      // Lançar um erro apropriado ou lançar uma exceção
      if (error.code === 'P2025') {
        // Erro específico quando o registro não é encontrado
        throw new Error('O projeto não foi encontrado.');
      } else {
        // Lidar com outros erros genéricos
        throw new Error('Erro ao tentar excluir o projeto. Por favor, tente novamente.');
      }
    }
  }

  async getItemsProjects(id: number): Promise<ProjectItems> {
    try {
      const projeto = await this.prisma.projeto.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          itens: {
            select: {
              genero: true, // Seleciona o campo de gênero             
              tamanhos: {
                select: {
                  id: true, // ID da relação ItemTamanho
                  item: {
                    select: {
                      nome: true, // Nome do item
                      composicao: true,
                    },
                  },
                  tamanho: {
                    select: {
                      nome: true, // Nome do tamanho
                    },
                  },
                  estoque: {
                    select: {
                      id: true,
                      quantidade: true, // Código de barras (opcional)
                    },
                  },
                  barcode: {
                    select: {
                      codigo: true, // Código de barras (opcional)
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!projeto) return null; // Retorna null se o projeto não for encontrado     

      // Transformação dos dados para a estrutura desejada
      const resultado = {
        id: projeto.id,
        nome: projeto.nome,
        itensProject: projeto.itens.flatMap((item) =>
          item.tamanhos.map((tamanho) => ({
            id: tamanho.id,  // ID da relação ItemTamanho
            nome: tamanho.item.nome,
            genero: item.genero, // Inclui o gênero na transformação
            composicao: tamanho.item.composicao,
            tamanho: tamanho.tamanho.nome,
            estoqueId: tamanho.estoque.id,
            estoque: tamanho.estoque.quantidade,
            barcode: tamanho.barcode?.codigo || null,
          }))
        ),
      };

      // Ordenar os itens por nome do item, depois pelo gênero, e depois pelo nome do tamanho
      resultado.itensProject.sort((a, b) => {
        const itemCompare = a.nome.localeCompare(b.nome);
        if (itemCompare !== 0) return itemCompare;

        const generoCompare = a.genero.localeCompare(b.genero);
        if (generoCompare !== 0) return generoCompare;

        const tamanhos = [a.tamanho, b.tamanho];
        const tamanhosOrdenados = sizeOrders(tamanhos);
        return tamanhosOrdenados.indexOf(a.tamanho) - tamanhosOrdenados.indexOf(b.tamanho);
      });

      return resultado; // Retorna o objeto diretamente
    } catch (error) {
      throw new Error('Erro ao tentar obter itens do projeto. Por favor, tente novamente.');
    }
  }

  async getOptimizedUniqueGradeDatesByProject(projectId: number): Promise<Date[]> {
    if (!projectId) {
      console.error('ID do projeto é inválido.');
      return []; // Retorna um array vazio se o ID for inválido
    }

    try {
      // Buscar as 13 datas mais recentes de inserção de grades para o projeto
      const uniqueDates = await this.prisma.$queryRaw<
        { createdAt: Date }[] // Retorna o campo completo de createdAt
      >(
        Prisma.sql`
        SELECT DISTINCT ON (DATE("Grade"."createdAt")) "Grade"."createdAt"
        FROM "Grade"
        INNER JOIN "Escola" ON "Grade"."escolaId" = "Escola"."id"
        WHERE "Escola"."projetoId" = ${projectId}
        ORDER BY DATE("Grade"."createdAt") DESC, "Grade"."createdAt" DESC
        LIMIT 13
      `
      );

      // Retorna as 13 datas mais recentes como estão no banco de dados
      return uniqueDates.map((row) => row.createdAt);
    } catch (error) {
      console.error(`Erro ao buscar as datas únicas das grades para o projeto ${projectId}:`, error);
      return [];
    }
  }

  async getUniqueGradeRemessasByProject(projectId: number): Promise<number[]> {
    try {
      const remessas = await this.prisma.$queryRaw<{ remessa: number }[]>(
        Prisma.sql`
        SELECT DISTINCT "Grade"."remessa"
        FROM "Grade"
        INNER JOIN "Escola" ON "Grade"."escolaId" = "Escola"."id"
        WHERE "Grade"."remessa" IS NOT NULL
        ${projectId !== -1 ? Prisma.sql`AND "Escola"."projetoId" = ${projectId}` : Prisma.empty}
        ORDER BY "Grade"."remessa" ASC
      `
      );

      return remessas.map(row => row.remessa);
    } catch (error) {
      console.error(`Erro ao buscar as remessas únicas das grades para o projeto ${projectId}:`, error);
      return [];
    }
  }

  async getFormattedGradesByDateAndProject(projectId: number, dateStr: string): Promise<GradesRomaneio[]> {
    if (!projectId || !dateStr) {
      console.error("Projeto ID ou data inválidos.");
      return [];
    }

    try {
      // Converte a string para um objeto Date
      const startOfDay = new Date(dateStr);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(dateStr);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // Busca as grades
      const grades = await this.prisma.grade.findMany({
        where: {
          escola: {
            projetoId: projectId,
          },
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          //finalizada: true || false,
        },
        include: {
          escola: {
            include: {
              address: true,
              telefone: true,  // Incluindo telefones da escola
              projeto: true,
            },
          },
          company: {
            include: {
              address: true,
              telefone: true,  // Incluindo telefones da empresa
              // O email está no próprio modelo 'Company'
            },
          },
          gradeCaixas: {
            include: {
              caixaItem: true,  // Incluindo itens de cada caixa
              tipoEmbalagem: true,
            },
          },
          itensGrade: {
            include: {
              itemTamanho: {
                include: {
                  item: true,
                  tamanho: true,
                },
              },
            },
          },
        },
      });

      function calcularPesoECubagemCaixas(caixas: Caixa[], itens: GradeItem[]): { pesoKg: number; cubagemM3: number } {

        function calcularPesoItens(itens: GradeItem[]): number {
          return itens.reduce((total, item) => {
            const peso = item.itemTamanho?.peso ?? 0;
            const quantidade = item.quantidadeExpedida ?? 0;
            return total + peso * quantidade;
          }, 0);
        }

        let totalPesoGramas = 0;
        let totalCubagemCM3 = 0;

        for (const caixa of caixas) {
          if (!caixa.tipoEmbalagem) continue; // pular caixas sem embalagem

          const { peso, largura, profundidade, altura = 40 } = caixa.tipoEmbalagem;
          const volumeCm3 = largura * profundidade * altura;
          totalPesoGramas += peso;
          totalCubagemCM3 += volumeCm3;
        }

        totalPesoGramas += calcularPesoItens(itens);

        return {
          pesoKg: totalPesoGramas / 1000,
          cubagemM3: totalCubagemCM3 / 1_000_000,
        };
      }

      // Formatação das grades
      const formattedGrades: GradesRomaneio[] = grades.map((grade) => {
        const pesoCubagem = calcularPesoECubagemCaixas(grade.gradeCaixas, grade.itensGrade);
        // Inclui nome do item em tamanhosEQuantidades
        const tamanhosEQuantidades = grade.itensGrade.map((itemGrade) => ({
          item: itemGrade.itemTamanho.item.nome, // Nome do item específico
          composicao: itemGrade.itemTamanho.item.composicao,
          genero: itemGrade.itemTamanho.item.genero,
          tamanho: itemGrade.itemTamanho.tamanho.nome, // Nome do tamanho
          quantidade: itemGrade.quantidadeExpedida,   // Quantidade expedida
          previsto: itemGrade.quantidade,
          peso: itemGrade.itemTamanho.peso,
        }));

        tamanhosEQuantidades.sort((a, b) => {
          // Comparar 'item' primeiro
          if (a.item < b.item) return -1;
          if (a.item > b.item) return 1;

          // Se os 'items' forem iguais, comparar 'genero'
          if (a.genero < b.genero) return -1;
          if (a.genero > b.genero) return 1;

          return 0; // São iguais em ambos os critérios
        });

        // Adicionando o array de caixas (com seus itens)
        const caixas = grade.gradeCaixas;
        return {
          id: grade.id,
          isPrint: grade.finalizada,
          company: grade.company.nome,
          cnpjCompany: grade.company.cnpj,
          projectname: grade.escola.projeto?.nome || "",
          escola: grade.escola.nome,
          tipo: grade.tipo,
          numeroEscola: grade.escola.numeroEscola || "",  // Número da escola
          status: grade.status,
          numberJoin: grade.escola.numberJoin,
          telefoneCompany: grade.company.telefone?.map(tel => tel.telefone).join(', ') || "",  // Telefones da empresa
          emailCompany: grade.company.email || "",   // E-mail da empresa (agora no modelo Company)
          telefoneEscola: grade.escola.telefone?.map(tel => tel.telefone).join(', ') || "", // Telefones da escola
          peso: pesoCubagem.pesoKg,
          cubagem: pesoCubagem.cubagemM3,
          create: convertSPTime(String(grade.createdAt)),
          update: convertSPTime(String(grade.updatedAt)),
          enderecoschool: {
            rua: grade.escola.address?.street || "",
            numero: grade.escola.address?.number || "",
            complemento: grade.escola.address?.complement || "",
            bairro: grade.escola.address?.neighborhood || "",
            cidade: grade.escola.address?.city || "",
            estado: grade.escola.address?.state || "",
            postalCode: grade.escola.address?.postalCode || "",
            country: grade.escola.address?.country || "",
          },
          tamanhosQuantidades: tamanhosEQuantidades, // Informações de tamanhos e quantidades
          caixas: caixas,  // Array com as caixas e seus itens
          enderecocompany: {
            rua: grade.company.address[0]?.street || "",
            numero: grade.company.address[0]?.number || "",
            complemento: grade.company.address[0]?.complement || "",
            bairro: grade.company.address[0]?.neighborhood || "",
            cidade: grade.company.address[0]?.city || "",
            estado: grade.company.address[0]?.state || "",
            postalCode: grade.company.address[0]?.postalCode || "",
            country: grade.company.address[0]?.country || "",
          },
        };
      });

      formattedGrades.sort((a, b) => {
        const numeroA = parseInt(a.numeroEscola, 10) || 0; // Converte para número ou usa 0 como fallback
        const numeroB = parseInt(b.numeroEscola, 10) || 0;
        return numeroA - numeroB; // Ordem crescente
      });

      return formattedGrades;
    } catch (error) {
      console.error(
        `Erro ao buscar grades para o projeto ${projectId} na data ${dateStr}:`,
        error
      );
      return [];
    }
  }

  // Função para buscar os itens e somar as entradas e saídas
  async getProjetoItensComEntradasSaidas(projetoId: number): Promise<ProjetoStockItems | null> {
    try {
      // Buscando o projeto
      const projeto = await this.prisma.projeto.findUnique({
        where: { id: projetoId },
        include: {
          itens: {
            include: {
              tamanhos: {
                include: {
                  tamanho: true,
                  entryInput: {
                    select: {
                      quantidade: true,
                    },
                  },
                  outInput: {
                    select: {
                      quantidade: true,
                    },
                  },
                  estoque: true,
                },
              },
            },
          },
        },
      });

      // Se o projeto não for encontrado, retorna null
      if (!projeto) {
        return null;
      }

      // Mapeando os itens e tamanhos
      const itensComEntradasSaidas = projeto.itens.map((item) => {
        const tamanhosComSomas = item.tamanhos.map((itemTamanho) => {
          // Soma das entradas e saídas
          const somaEntradas = itemTamanho.entryInput.reduce((total, entry) => total + entry.quantidade, 0);
          const somaSaidas = itemTamanho.outInput.reduce((total, out) => total + out.quantidade, 0);

          // Estoque
          const estoque = itemTamanho.estoque ? itemTamanho.estoque.quantidade : 0;

          return {
            tamanho: itemTamanho.tamanho.nome,
            estoque,
            entradas: somaEntradas,
            saidas: somaSaidas,
          };
        });

        // Ordenando tamanhos por critérios específicos
        const tamanhosOrdenados = sizeOrders(
          item.tamanhos.map((itemTamanho) => itemTamanho.tamanho.nome)
        );

        return {
          nome: item.nome,
          genero: item.genero,
          tamanhos: tamanhosOrdenados.map(tamanho => {
            const tamanhoData = tamanhosComSomas.find(t => t.tamanho === tamanho);
            return tamanhoData ? tamanhoData : {
              tamanho,
              entradas: 0,
              saidas: 0,
              estoque: 0,
            };
          }),
        };
      });

      return {
        projetoId: projeto.id,
        nome: projeto.nome,
        itens: itensComEntradasSaidas,
      };
    } catch (error) {
      // Captura e exibe o erro
      console.error('Erro ao buscar projeto e itens:', error);
      return null;
    }
  }

  async getOpenGradesBySchool(projetoId: number, dateStr: string): Promise<GradeOpenBySchool[] | null> {
    if (!projetoId || !dateStr) {
      console.error("Projeto ID ou data inválidos.");
      return null;
    }

    try {
      // Converte a string para um objeto Date
      const startOfDay = new Date(dateStr);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(dateStr);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const projeto = await this.prisma.projeto.findUnique({
        where: {
          id: projetoId,
        },
        include: {
          escolas: {
            include: {
              grades: {
                where: {
                  createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                  },
                },
                include: {
                  escola: true, // Incluindo os dados da Escola
                  gradeCaixas: {
                    include: {
                      caixaItem: true, // Incluindo os itens das caixas
                    },
                  },
                  itensGrade: {
                    include: {
                      itemTamanho: {
                        include: {
                          item: true, // Incluindo detalhes do Item
                          tamanho: true, // Incluindo o Tamanho
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

      // Verificar se o projeto existe
      if (!projeto) {
        return null;
      }

      // Processar as grades e caixas
      const result: GradeOpenBySchool[] = projeto.escolas.flatMap((escola) => {
        return escola.grades.map((grade) => {
          const itens = grade.itensGrade.map((itemGrade) => {
            const caixas = grade.gradeCaixas.flatMap((caixa) =>
              caixa.caixaItem.filter(
                (caixaItem) => caixaItem.itemTamanhoId === itemGrade.itemTamanho.id
              )
            );

            const quantidadeExpedida = caixas.reduce((sum, caixaItem) => sum + caixaItem.itemQty, 0);

            // Definir o status de expedição com os valores restritos
            const statusExpedicao: "Concluído" | "Pendente" | "Inicializado" = quantidadeExpedida == itemGrade.quantidade ?
              "Concluído" : quantidadeExpedida == 0 ? "Pendente" : "Inicializado";

            return {
              gradeId: grade.id,
              itemNome: `${itemGrade.itemTamanho.item.nome} / ${itemGrade.itemTamanho.item.genero}`,
              tamanho: itemGrade.itemTamanho.tamanho.nome,
              quantidadePrevista: itemGrade.quantidade,
              quantidadeExpedida,
              quantidadeRestante: itemGrade.quantidade - quantidadeExpedida,
              statusExpedicao,  // Garantir que este valor seja restrito a "Concluído" ou "Pendente" ou "Inicializado"
            };
          });

          // Ordenando os itens
          itens.sort((a, b) => {
            // Primeiro ordenar pelo nome do item (itemNome)
            if (a.itemNome < b.itemNome) return -1;
            if (a.itemNome > b.itemNome) return 1;

            // Se os nomes forem iguais, ordenar pelo tamanho usando a função
            const tamanhos = [a.tamanho, b.tamanho];
            const tamanhosOrdenados = sizeOrders(tamanhos);
            return tamanhosOrdenados.indexOf(a.tamanho) - tamanhosOrdenados.indexOf(b.tamanho);
          });

          return {
            projetoName: projeto.nome,
            escolaNome: `${grade.escola.nome} - ${grade.escola.numeroEscola}`,
            data: convertSPTime(String(grade.createdAt)),
            itens,
          };
        });
      });

      return result;

    } catch (error) {
      console.error('Erro ao obter os dados das grades:', error);
      throw new Error('Erro ao tentar obter as grades. Por favor, tente novamente.');
    }
  }

  async getProjetoComResumoExpedicao(
    projectId: number,
    remessa: number,
    status: "EXPEDIDA" | "DESPACHADA" | "PRONTA" | "IMPRESSA" | "TODAS",
    tipo: string,
  ): Promise<GradesRomaneio[]> {
    try {
      const projectsWithGrades = await this.prisma.projeto.findMany({
        where: {
          ...(projectId > 0 ? { id: projectId } : {})
        },
        include: {
          escolas: {
            include: {
              address: true,
              telefone: true,
              grades: {
                where: {
                  ...(remessa > 0 ? { remessa } : {}),
                  ...(status !== "TODAS" ? { status } : {}),
                  ...(tipo === "N"
                    ? { tipo: null }
                    : tipo === "R"
                      ? { tipo: { contains: "REPOS", mode: 'insensitive' } }
                      : {}),
                },
                include: {
                  company: { include: { address: true, telefone: true } },
                  itensGrade: { include: { itemTamanho: { include: { item: true, tamanho: true } } } },
                  gradeCaixas: {
                    include: {
                      tipoEmbalagem: {
                        select: {
                          id: true,
                          nome: true,
                          peso: true,
                          altura: true,
                          largura: true,
                          profundidade: true,
                          createdAt: true,
                          updatedAt: true,
                        },
                      }
                    }
                  },
                },
              },
            },
          },
        },
      });

      if (!projectsWithGrades || projectsWithGrades.length === 0) {
        return [];
      }

      function transformPeso(n: number): number {
        if (n > 0) {
          return n / 1000;
        }
        return n;
      }

      function calcularPesoECubagemCaixas(caixas: Caixa[], itens: GradeItem[]): { pesoKg: number; cubagemM3: number } {

        function calcularPesoItens(itens: GradeItem[]): number {
          return itens.reduce((total, item) => {
            const peso = item.itemTamanho?.peso ?? 0;
            const quantidade = item.quantidadeExpedida ?? 0;
            return total + peso * quantidade;
          }, 0);
        }

        let totalPesoGramas = 0;
        let totalCubagemCM3 = 0;

        for (const caixa of caixas) {
          if (!caixa.tipoEmbalagem) continue; // pular caixas sem embalagem

          const { peso, largura, profundidade, altura = 40 } = caixa.tipoEmbalagem;
          const volumeCm3 = largura * profundidade * altura;
          totalPesoGramas += peso;
          totalCubagemCM3 += volumeCm3;
        }

        totalPesoGramas += calcularPesoItens(itens);

        return {
          pesoKg: totalPesoGramas / 1000,
          cubagemM3: totalCubagemCM3 / 1_000_000,
        };
      }

      function calcularPorcentagem(parte: number, total: number): number {
        if (total === 0) return 0;
        return (parte / total) * 100;
      }

      let formattedData = projectsWithGrades.flatMap((projeto) =>
        (projeto.escolas ?? []).flatMap((escola) =>
          (escola.grades ?? []).map((grade) => {
            const pesoCubagem = calcularPesoECubagemCaixas(grade.gradeCaixas, grade.itensGrade);
            //console.dir(grade, { depth: null, colors: true });
            return {
              id: grade.id,
              isPrint: grade.finalizada,
              company: grade.company?.nome ?? "",
              cnpjCompany: grade.company?.cnpj ?? "",
              projectname: projeto.nome,
              escola: escola.nome,
              escolaId: escola.id,
              tipo: grade.tipo,
              numeroEscola: escola.numeroEscola,
              status: grade.status,
              numberJoin: escola.numberJoin,
              telefoneCompany: (grade.company?.telefone ?? []).map((t) => t.telefone).join(", ") || "-",
              emailCompany: grade.company?.email ?? "",
              telefoneEscola: (escola?.telefone ?? []).map(tel => tel.telefone).join(', ') || "-",
              peso: pesoCubagem.pesoKg,
              cubagem: pesoCubagem.cubagemM3,
              create: convertSPTime(String(grade.createdAt)),
              update: convertSPTime(String(grade.updatedAt)),

              // Endereço da Escola
              enderecoschool: {
                rua: escola?.address?.street ?? "",
                numero: escola?.address?.number ?? "",
                complemento: escola?.address?.complement ?? "",
                bairro: escola?.address?.neighborhood ?? "",
                cidade: escola?.address?.city ?? "",
                estado: escola?.address?.state ?? "",
                postalCode: escola?.address?.postalCode ?? "",
                country: escola?.address?.country ?? "",
              },

              // Endereço da Company (agora sempre retorna um objeto, mesmo se não houver dados)
              enderecocompany: {
                rua: grade.company?.address?.[0]?.street ?? "",
                numero: grade.company?.address?.[0]?.number ?? "",
                complemento: grade.company?.address?.[0]?.complement ?? "",
                bairro: grade.company?.address?.[0]?.neighborhood ?? "",
                cidade: grade.company?.address?.[0]?.city ?? "",
                estado: grade.company?.address?.[0]?.state ?? "",
                postalCode: grade.company?.address?.[0]?.postalCode ?? "",
                country: grade.company?.address?.[0]?.country ?? "",
              },

              tamanhosQuantidades: (grade.itensGrade ?? []).map((gradeItem) => ({
                item: gradeItem.itemTamanho?.item?.nome,
                genero: gradeItem.itemTamanho?.item?.genero,
                tamanho: gradeItem.itemTamanho?.tamanho?.nome,
                composicao: gradeItem.itemTamanho?.item?.composicao,
                quantidade: gradeItem.quantidadeExpedida,
                previsto: gradeItem.quantidade,
                peso: transformPeso(gradeItem.itemTamanho.peso),
                altura: gradeItem.itemTamanho.altura,
                largura: gradeItem.itemTamanho.largura,
                profundidade: gradeItem.itemTamanho.profundidade,
              })).sort((a, b) => {
                if (a.item < b.item) return -1;
                if (a.item > b.item) return 1;
                if (a.genero < b.genero) return -1;
                if (a.genero > b.genero) return 1;
                const tamanhos = [a.tamanho, b.tamanho];
                const tamanhosOrdenados = sizeOrders(tamanhos);
                return tamanhosOrdenados.indexOf(a.tamanho) - tamanhosOrdenados.indexOf(b.tamanho);
              }),

              caixas: grade.gradeCaixas ?? [],
            }
          })
        )
      );

      if (status === "TODAS") {
        const statusOrder = { PRONTA: 1, EXPEDIDA: 2, DESPACHADA: 3, IMPRESSA: 4 };

        // Ordenação primeiro pelo status
        formattedData = formattedData.sort((a, b) =>
          (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5)
        );

        // Agora, dentro de cada status, ordenar alfabeticamente pelo nome da escola
        formattedData = formattedData.sort((a, b) => {
          // Ordena primeiro pelo status e depois pelo nome da escola
          if (a.status === b.status) {
            const numeroEscolaA = parseInt(a.numeroEscola, 10);
            const numeroEscolaB = parseInt(b.numeroEscola, 10);
            return numeroEscolaA - numeroEscolaB;
          }
          return (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
        });
      }

      // Ordenação se for "PRONTA"
      if (status === "PRONTA") {
        formattedData = formattedData.sort((a, b) => {
          const totalA = a.tamanhosQuantidades.reduce((sum, item) => sum + item.quantidade, 0);
          const totalB = b.tamanhosQuantidades.reduce((sum, item) => sum + item.quantidade, 0);
          const totalAP = a.tamanhosQuantidades.reduce((sum, item) => sum + item.previsto, 0);
          const totalBP = b.tamanhosQuantidades.reduce((sum, item) => sum + item.previsto, 0);
          const totalPorcentA = calcularPorcentagem(totalA, totalAP);
          const totalPorcentB = calcularPorcentagem(totalB, totalBP);
          return totalPorcentB - totalPorcentA;
        });
      }

      // Ordenação se for "EXPEDIDA"
      if (status === "EXPEDIDA") {
        formattedData = formattedData.sort((a, b) => {
          const numeroEscolaA = parseInt(a.numeroEscola, 10);
          const numeroEscolaB = parseInt(b.numeroEscola, 10);
          return numeroEscolaA - numeroEscolaB;
        });
      }

      /* Ordenação se for "DESPACHADA"
      if (status === "DESPACHADA") {
        formattedData = formattedData.sort((a, b) => {
          const numeroEscolaA = parseInt(a.numeroEscola, 10);
          const numeroEscolaB = parseInt(b.numeroEscola, 10);
          return numeroEscolaA - numeroEscolaB;
        });
      }*/

      if (status === "DESPACHADA") {
        formattedData = formattedData.sort((a, b) => {
          const parseDate = (str: string) => {
            const [date] = str.split(" ");
            const [day, month, year] = date.split("/");
            return new Date(Number(year), Number(month) - 1, Number(day));
          };

          const dateA = parseDate(a.update).getTime();
          const dateB = parseDate(b.update).getTime();

          // Ordena por data (mais recente primeiro)
          if (dateA !== dateB) {
            return dateB - dateA;
          }

          // Se a data for igual, ordena pelo número da escola
          return parseInt(a.numeroEscola, 10) - parseInt(b.numeroEscola, 10);
        });
      }

      return formattedData;
    } catch (error) {
      console.error("Erro ao buscar projeto:", error);
      throw new Error("Erro interno ao buscar os dados do projeto.");
    }
  }

  async somarQuantidadesPorProjeto(): Promise<Grafo[]> {
    try {
      // Passo 1: Obter a remessa mais alta para cada escola
      const remessasMaisAltas = await this.prisma.grade.groupBy({
        by: ['remessa', 'escolaId'],
        _max: {
          remessa: true, // Obtendo a remessa mais alta para cada escola
        },
      });

      // Passo 2: Obter as grades com a remessa mais alta de cada escola
      const grades = await this.prisma.grade.findMany({
        where: {
          remessa: {
            in: remessasMaisAltas.map((item) => item._max.remessa),
          },
          tipo: null,
        },
        include: {
          escola: {
            include: {
              projeto: true, // Incluindo os dados do projeto
            },
          },
          itensGrade: { // Incluir os itens de cada grade
            select: {
              quantidade: true,
              quantidadeExpedida: true,
            },
          },
        },
      });

      if (!grades || grades.length === 0) {
        return [];
      }

      // Passo 4: Agrupar as quantidades de `GradeItem` por projeto
      const resultado = grades.reduce<{ [projetoId: number]: Grafo }>((acc, grade) => {
        const projetoId = grade.escola.projetoId;
        const nomeProjeto = grade.escola.projeto.nome;

        // Calcular a soma das quantidades para esta grade
        const somaQuantidade = grade.itensGrade.reduce((sum, item) => sum + item.quantidade, 0);
        const somaQuantidadeExpedida = grade.itensGrade.reduce((sum, item) => sum + item.quantidadeExpedida, 0);

        // Verificando se o projeto já foi adicionado ao acumulado
        if (!acc[projetoId]) {
          acc[projetoId] = {
            nomeProjeto,
            quantidadeTotal: 0,
            quantidadeExpedida: 0,
          };
        }

        // Acumulando as quantidades
        acc[projetoId].quantidadeTotal += somaQuantidade;
        acc[projetoId].quantidadeExpedida += somaQuantidadeExpedida;

        return acc;
      }, {});

      // Passo 5: Filtrar os projetos que já tiveram as quantidades atendidas
      const resultadoFiltrado = Object.values(resultado).filter(
        (projeto) => projeto.quantidadeTotal !== projeto.quantidadeExpedida && projeto.quantidadeTotal > 0
      );

      // Passo 6: Exibir os resultados ou retornar
      return resultadoFiltrado;

    } catch (error) {
      console.error('Erro ao buscar dados dos projetos:', error);
      throw new Error('Erro interno ao buscar os dados dos projetos.');
    }
  }

}
