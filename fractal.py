import numpy as np
import matplotlib.pylab as plb
import matplotlib.pyplot as plt
from matplotlib.path import Path
import matplotlib.patches as patches
from time import sleep

'''
def rotation():
    s=np.zeros((3,5)).astype(int)

    s[0,2]=1
    s[1,1:-1]=1
    s[-1,:]=1
    # s[-1,-1]=1
    s[2,2]=3
    s[0,2]=5



    for _ in range(20):
        plb.spy(s)
        plb.show(block=False)
        input('press <ENTER> to continue')
        st=roth(s)
        dimx=s.shape[0]
        dimy=s.shape[1]
        S=np.zeros((dimx+2*dimy,dimy+2*dimx)).astype(int)
        S[dimy:dimy+dimx,dimx:dimx+dimy]=s
        # print(S)
        iy = int(np.where(st==3)[0])
        ix = int(np.where(st==3)[1])
        fy = int(np.where(S==5)[0])
        fx = int(np.where(S==5)[1])
        dx = fx - ix
        dy = fy - iy
        S[dy:dy+dimy,dx:dx+dimx] += st
        # print(S)
        S[np.where(S==8)]=1
        S[np.where(S==4)]=3
        S[np.where(S==6)]=5
        S[np.where(S==2)]=1
        del(s)
        # min(np.where(S>0)[0]):max(np.where(S>0)[0])+1,min(np.where(S>0)[1]):max(np.where(S>0)[1])+1
        
        
        

        s=S[min(np.where(S>0)[0]):max(np.where(S>0)[0])+1,min(np.where(S>0)[1]):max(np.where(S>0)[1])+1]
        # print(s)

        # print(np.where(S==5)[0])
        # break


def roth(m):
    return np.fliplr(np.transpose(m))

def rotah(m):
    return np.flipud(np.transpose(m))

def rotj(m):
    return np.fliplr(np.flipud(m))
'''

'''
fractal tree
'''
branches = 4
b_length = 1

drate = 0.8
stps = 8

class fractal_tree():
    def __init__(self,brnchs,bl,ang,dr):
        self.brnchs = brnchs
        self.bl = bl
        self.ang = ang/180*np.pi
        self.dr = dr
        self.b = [[(0,0),(0,bl)]]
        self.init_figure()


    def init_figure(self):
        codes = [Path.MOVETO,
                Path.LINETO]
        path = Path(self.b[0], codes)
        self.fig, self.ax = plt.subplots()
        patch = patches.PathPatch(path, facecolor='none', lw=1)
        self.ax.add_patch(patch)

        self.ax.set_xlim(-3, 3)
        self.ax.set_ylim(-1, 5)
        plt.show(block=False)
        plt.pause(0.00000000000001)

    def grow(self):
        # print(self.b[0])
        new_b = []
        for l in self.b:
            p1 = np.array(l[0])
            p2 = np.array(l[1])
            b1 = p2 - p1
            b2 = b1*self.dr
            Ra = np.array([[np.cos(self.ang),-np.sin(self.ang)],[np.sin(self.ang),np.cos(self.ang)]])
            beta = 2*(-self.ang)/(self.brnchs-1)
            Rb = np.array([[np.cos(beta),-np.sin(beta)],[np.sin(beta),np.cos(beta)]])
            Pnl = [np.matmul(b2, Ra)]

            for n in range(1,self.brnchs):
                Pnl.append(np.matmul(Pnl[-1],Rb)/(1+n)) 
            [new_b.append([l[1],tuple(Pnl[k]+p2)]) for k in range(self.brnchs)]
        self.b = new_b    
        self.bl *= self.dr

    def update_figure(self):
        for l in self.b:
            codes = [Path.MOVETO,
                    Path.LINETO]
            path = Path(l, codes)
            patch = patches.PathPatch(path, facecolor='none', lw=1)
            self.ax.add_patch(patch)
        if self.m == stps -1:
            self.ax.set_xlim(-1, 3)
            self.ax.set_ylim(0, 3)
            plt.show(block=False)
            plt.pause(0.0001)


def main_fractal_tree():
    tree = fractal_tree(branches,b_length,angle,drate)
    for aa in range(30,31,3):
        tree.ang = aa/180*np.pi
        tree.b = [[(0,0),(0,b_length)]]
        plt.pause(0.1)
        plt.cla()
        for m in range(stps):
            tree.m = m
            tree.grow()

            tree.update_figure()
    plt.show(block=True)



angle = 30 #º




if __name__ == "__main__":
    # rotation()
    main_fractal_tree()