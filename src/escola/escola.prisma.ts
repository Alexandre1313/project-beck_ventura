import { Escola } from '@core/index';
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
                    take: 50, // Limitar a 50 grades
                    orderBy: {
                        createdAt: 'asc', // Ordenar por data de criação, mais recentes primeiro
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
            include: {
                grades: {
                    include: {
                        itensGrade: {
                            include: {
                                itemTamanho: {
                                    include: {
                                        item: true, // Inclui os detalhes do item
                                        tamanho: true, // Inclui os detalhes do tamanho                         
                                        estoque: true, // Inclui o estoque associado a este item/tamanho
                                        barcode: true
                                    },
                                },
                            },
                            orderBy: {
                                itemTamanho: { // Primeiro ordena os itens pelo nome
                                    item: {
                                        nome: 'asc', // Ordena os itens pelo nome
                                    },
                                },
                            },
                        },
                    },
                },
            }
        })
        return escolaComGrades
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
}
